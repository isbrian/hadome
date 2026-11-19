'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { makeSupervisor } = require('../src/supervisor');

function fixture(t) {
  // ponytail: stdlib: mkdtemp で試験データを隔離 | upgrade if: 共有テスト環境が必要になった場合
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-t023-lease-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let current = 1000;
  return { root, workspace: 'offline-workspace', now: () => current, advance: (ms) => { current += ms; } };
}

function worker(root, owner) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'supervisor-claim-worker.js'), root, 'offline-workspace', owner], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`worker exit ${code}: ${errors}`));
      try { resolve(JSON.parse(output)); } catch { reject(new Error(`worker output invalid: ${output}`)); }
    });
  });
}

test('M2: 実行中の workspace は別タスクを claim できない', (t) => {
  const s = makeSupervisor(fixture(t));
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  s.enqueue({ id: 't-2', idempotencyKey: 'key-2' });
  const claim = s.claim({ owner: 'owner-A', leaseMs: 200 });
  assert.equal(claim.id, 't-1');
  assert.equal(claim.status, 'claimed');
  assert.ok(claim.runId);
  assert.equal(claim.leaseUntil, 1200);
  assert.equal(s.claim({ owner: 'owner-B', leaseMs: 200 }), null);
  assert.throws(() => s.start({ id: claim.id, owner: 'owner-B', runId: claim.runId }), /owner|token/i);
  const running = s.start({ id: claim.id, owner: 'owner-A', runId: claim.runId });
  assert.equal(running.status, 'running');
  assert.equal(running.attempts, 1);
  assert.equal(s.claim({ owner: 'owner-B', leaseMs: 200 }), null);
});

test('M2: 心拍は lease を延長し、旧 owner と runId を拒否する', (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  const claim = s.claim({ owner: 'owner-A', leaseMs: 200 });
  s.start({ id: claim.id, owner: 'owner-A', runId: claim.runId });
  options.advance(100);
  assert.throws(() => s.heartbeat({ id: claim.id, owner: 'owner-B', runId: claim.runId, leaseMs: 300 }), /owner|token/i);
  assert.throws(() => s.heartbeat({ id: claim.id, owner: 'owner-A', runId: 'stale', leaseMs: 300 }), /runId|owner|token/i);
  assert.equal(s.heartbeat({ id: claim.id, owner: 'owner-A', runId: claim.runId, leaseMs: 300 }).leaseUntil, 1400);
  assert.throws(() => s.complete({ id: claim.id, owner: 'owner-B', runId: claim.runId, outcome: { status: 'success' } }), /owner|token/i);
});

test('M2: 期限切れは unknown となり、自動再実行しない', (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  s.enqueue({ id: 't-2', idempotencyKey: 'key-2' });
  const claim = s.claim({ owner: 'owner-A', leaseMs: 100 });
  s.start({ id: claim.id, owner: 'owner-A', runId: claim.runId });
  options.advance(101);
  assert.equal(s.claim({ owner: 'owner-B', leaseMs: 100 }), null);
  assert.equal(s.recoverExpired(), 1);
  assert.equal(s.get('t-1').status, 'unknown');
  assert.equal(s.get('t-1').result.reason, 'lease-expired');
  assert.equal(s.claim({ owner: 'owner-B', leaseMs: 100 }), null);
  assert.throws(() => s.complete({ id: claim.id, owner: 'owner-A', runId: claim.runId, outcome: { status: 'success' } }), /state|expired|owner/i);
});

test('M2: 残存ロックがある場合は停止し記録を保持する', (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  fs.mkdirSync(path.join(options.root, '.tasks-write-lock'));
  assert.throws(() => s.claim({ owner: 'owner-A', leaseMs: 100 }), /lock|busy/i);
  assert.equal(s.get('t-1').status, 'pending');
});

test('M2: 二つの Node プロセス間で claim は最大一件', async (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  s.enqueue({ id: 't-2', idempotencyKey: 'key-2' });
  const results = await Promise.all([worker(options.root, 'owner-A'), worker(options.root, 'owner-B')]);
  assert.equal(results.filter((result) => result.claimed).length, 1);
  assert.equal(s.list().filter((task) => task.status === 'claimed').length, 1);
});

test('M2: owner プロセス終了後も期限切れタスクは再開しない', async (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  assert.equal((await worker(options.root, 'departed-owner')).claimed, true);
  options.advance(1001);
  assert.equal(s.recoverExpired(), 1);
  assert.equal(s.get('t-1').status, 'unknown');
  assert.equal(s.claim({ owner: 'replacement', leaseMs: 100 }), null);
});
