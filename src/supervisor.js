'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 1;
const STATES = new Set(['pending', 'claimed', 'running', 'succeeded', 'failed', 'unknown', 'cancelled']);
const TERMINAL = new Set(['succeeded', 'failed', 'unknown', 'cancelled']);

function makeSupervisor({ root, workspace, now = Date.now } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || !root.trim()) {
    throw new TypeError('supervisor root must be an absolute dedicated directory');
  }
  if (typeof workspace !== 'string' || !workspace.trim()) {
    throw new TypeError('workspace is required');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const filename = path.join(root, 'tasks.json');
  const lockPath = path.join(root, '.tasks-write-lock');

  function emptyStore() {
    return { version: VERSION, workspace, tasks: [] };
  }

  function validate(store) {
    if (!store || typeof store !== 'object' || Array.isArray(store)) {
      throw new Error('invalid supervisor store');
    }
    if (store.version !== VERSION) throw new Error('unsupported supervisor store version');
    if (store.workspace !== workspace) throw new Error('supervisor workspace mismatch');
    if (!Array.isArray(store.tasks)) throw new Error('invalid supervisor tasks');
    const ids = new Set();
    const keys = new Set();
    for (const task of store.tasks) {
      if (!task || typeof task !== 'object' ||
          typeof task.id !== 'string' || !task.id ||
          typeof task.idempotencyKey !== 'string' || !task.idempotencyKey ||
          task.workspace !== workspace || task.executor !== 'fake' ||
          !STATES.has(task.status) ||
          !Number.isInteger(task.attempts) || task.attempts < 0 ||
          !Number.isInteger(task.maxAttempts) || task.maxAttempts < 1 ||
          task.attempts > task.maxAttempts ||
          !Number.isFinite(task.createdAt) || !Number.isFinite(task.updatedAt)) {
        throw new Error('invalid supervisor task');
      }
      if (ids.has(task.id) || keys.has(task.idempotencyKey)) {
        throw new Error('invalid duplicate task record');
      }
      ids.add(task.id);
      keys.add(task.idempotencyKey);
    }
    return store;
  }

  function read() {
    let raw;
    try {
      raw = fs.readFileSync(filename, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return emptyStore();
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('corrupt supervisor JSON');
    }
    return validate(parsed);
  }

  function atomicSave(store) {
    validate(store);
    const temporary = path.join(root, `.tasks-${process.pid}-${crypto.randomUUID()}.tmp`);
    let fd;
    try {
      // ponytail: stdlib: 同一ファイルシステム内の一時ファイルと rename を利用 | upgrade if: トランザクション DB が必要になった場合
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(store, null, 2) + '\n', 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, filename);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  function mutate(change) {
    fs.mkdirSync(root, { recursive: true });
    // ponytail: stdlib: mkdir の排他性で更新を直列化 | upgrade if: 複数ホストから更新する場合
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('supervisor store lock busy; manual recovery required');
      throw error;
    }
    try {
      const store = read();
      const outcome = change(store);
      if (outcome.changed) atomicSave(store);
      return structuredClone(outcome.value);
    } finally {
      fs.rmdirSync(lockPath);
    }
  }

  function enqueue({ id, idempotencyKey, payload = null, maxAttempts = 3 } = {}) {
    if (typeof id !== 'string' || !id.trim() ||
        typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new TypeError('task id and idempotencyKey are required');
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new TypeError('invalid maxAttempts');
    }
    return mutate((store) => {
      const previous = store.tasks.find((task) => task.idempotencyKey === idempotencyKey);
      if (previous) return { changed: false, value: previous };
      if (store.tasks.some((task) => task.id === id)) throw new Error('duplicate task id');
      const timestamp = now();
      if (!Number.isFinite(timestamp)) throw new TypeError('invalid timestamp');
      const task = {
        id,
        idempotencyKey,
        workspace,
        executor: 'fake',
        payload: structuredClone(payload),
        status: 'pending',
        attempts: 0,
        maxAttempts,
        runId: null,
        owner: null,
        leaseUntil: null,
        result: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.tasks.push(task);
      return { changed: true, value: task };
    });
  }

  function list() {
    return structuredClone(read().tasks);
  }

  function get(id) {
    return list().find((task) => task.id === id) || null;
  }

  function transition(id, status) {
    if (!STATES.has(status)) throw new Error('invalid state transition');
    return mutate((store) => {
      const task = store.tasks.find((item) => item.id === id);
      if (!task) throw new Error('task not found');
      if (TERMINAL.has(task.status)) throw new Error('illegal state transition from terminal state');
      if (task.status !== 'pending' || status !== 'cancelled') {
        throw new Error('illegal state transition: owner-verified operation required');
      }
      task.status = status;
      task.updatedAt = now();
      return { changed: true, value: task };
    });
  }

  function validLease(owner, leaseMs) {
    if (typeof owner !== 'string' || !owner.trim()) throw new TypeError('owner is required');
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new TypeError('invalid leaseMs');
  }

  function requireTask(store, id) {
    const task = store.tasks.find((item) => item.id === id);
    if (!task) throw new Error('task not found');
    return task;
  }

  function verifyOwner(task, owner, runId) {
    if (!owner || !runId || task.owner !== owner || task.runId !== runId) {
      throw new Error('owner or runId token mismatch');
    }
    if (task.status !== 'claimed' && task.status !== 'running') {
      throw new Error('invalid task state for owner operation');
    }
    if (!Number.isFinite(task.leaseUntil) || now() >= task.leaseUntil) {
      throw new Error('owner lease expired');
    }
  }

  function claim({ owner, leaseMs = 30000 } = {}) {
    validLease(owner, leaseMs);
    return mutate((store) => {
      // 結果不明のタスクが残っている場合、同一 workspace の実行を停止する。
      if (store.tasks.some((task) => ['claimed', 'running', 'unknown'].includes(task.status))) {
        return { changed: false, value: null };
      }
      const task = store.tasks.find((item) => item.status === 'pending');
      if (!task) return { changed: false, value: null };
      const timestamp = now();
      if (!Number.isFinite(timestamp)) throw new TypeError('invalid timestamp');
      task.status = 'claimed';
      task.owner = owner;
      task.runId = crypto.randomUUID();
      task.leaseUntil = timestamp + leaseMs;
      task.updatedAt = timestamp;
      return { changed: true, value: task };
    });
  }

  function start({ id, owner, runId } = {}) {
    return mutate((store) => {
      const task = requireTask(store, id);
      verifyOwner(task, owner, runId);
      if (task.status !== 'claimed') throw new Error('invalid state transition to running');
      if (task.attempts >= task.maxAttempts) throw new Error('attempt limit reached');
      task.status = 'running';
      task.attempts += 1;
      task.updatedAt = now();
      return { changed: true, value: task };
    });
  }

  function heartbeat({ id, owner, runId, leaseMs = 30000 } = {}) {
    validLease(owner, leaseMs);
    return mutate((store) => {
      const task = requireTask(store, id);
      verifyOwner(task, owner, runId);
      const timestamp = now();
      task.leaseUntil = timestamp + leaseMs;
      task.updatedAt = timestamp;
      return { changed: true, value: task };
    });
  }

  function complete({ id, owner, runId, outcome } = {}) {
    return mutate((store) => {
      const task = requireTask(store, id);
      verifyOwner(task, owner, runId);
      if (task.status !== 'running') throw new Error('invalid state transition to completed');
      if (!outcome || !['success', 'failure', 'unknown'].includes(outcome.status)) {
        throw new Error('invalid executor outcome');
      }
      const safeRetry = outcome.status === 'failure' &&
        outcome.retryable === true && outcome.noSideEffects === true &&
        task.attempts < task.maxAttempts;
      task.status = safeRetry ? 'pending' :
        { success: 'succeeded', failure: 'failed', unknown: 'unknown' }[outcome.status];
      task.result = structuredClone(outcome);
      task.leaseUntil = null;
      if (safeRetry) {
        task.owner = null;
        task.runId = null;
      }
      task.updatedAt = now();
      return { changed: true, value: task };
    });
  }

  function recoverExpired() {
    return mutate((store) => {
      const timestamp = now();
      if (!Number.isFinite(timestamp)) throw new TypeError('invalid timestamp');
      let count = 0;
      for (const task of store.tasks) {
        if (['claimed', 'running'].includes(task.status) &&
            Number.isFinite(task.leaseUntil) && timestamp >= task.leaseUntil) {
          task.status = 'unknown';
          task.result = { status: 'unknown', reason: 'lease-expired' };
          task.updatedAt = timestamp;
          count += 1;
        }
      }
      return { changed: count > 0, value: count };
    });
  }

  async function runOnce({ owner, leaseMs = 30000, executor } = {}) {
    if (typeof executor !== 'function') throw new TypeError('fake executor function required');
    validLease(owner, leaseMs);
    const claimed = claim({ owner, leaseMs });
    if (!claimed) return null;
    const task = start({ id: claimed.id, owner, runId: claimed.runId });
    let outcome;
    try {
      outcome = await executor(structuredClone(task));
    } catch {
      outcome = { status: 'unknown', reason: 'executor-threw' };
    }
    if (!outcome || typeof outcome !== 'object' ||
        !['success', 'failure', 'unknown'].includes(outcome.status)) {
      outcome = { status: 'unknown', reason: 'invalid-executor-result' };
    }
    return complete({ id: task.id, owner, runId: task.runId, outcome });
  }

  return { enqueue, list, get, transition, claim, start, heartbeat, complete, recoverExpired, runOnce };
}

module.exports = { makeSupervisor };
