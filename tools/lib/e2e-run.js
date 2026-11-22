'use strict';

// T-046：獨立的 E2E run 台帳。只管理本模組建立的暫存路徑及經身分核對的子程序。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const PREFIX = 'hadome-e2e-';
const BRIDGE_PORT = 8799;
const DISPOSABLE = ['profiles', 'workspace', 'ports'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function versionMetadata() {
  const repo = path.resolve(__dirname, '../..');
  let commit = null;
  let playwrightCoreVersion = null;
  let browserRevision = null;
  let browserVersion = null;
  let extensionVersion = null;
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  try { extensionVersion = require(path.join(repo, 'package.json')).version; } catch {}
  try { playwrightCoreVersion = require(path.join(repo, 'node_modules/playwright-core/package.json')).version; } catch {}
  try {
    const browsers = require(path.join(repo, 'node_modules/playwright-core/browsers.json'));
    const chromium = browsers.browsers.find((browser) => browser.name === 'chromium');
    if (chromium) { browserRevision = chromium.revision; browserVersion = chromium.browserVersion; }
  } catch {}
  return { commit, nodeVersion: process.version, playwrightCoreVersion, browserRevision, browserVersion,
    editorVersion: null, extensionVersion, protocol: null };
}

function assertRunRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('run root 必須是絕對路徑');
  const st = fs.lstatSync(root);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('run root 不是實體目錄');
  const real = fs.realpathSync(root);
  const tmp = fs.realpathSync(os.tmpdir());
  if (!real.startsWith(tmp + path.sep) || !path.basename(real).startsWith(PREFIX)) {
    throw new Error('拒絕操作暫存 E2E 根目錄以外的路徑');
  }
  return real;
}

function manifestPath(root) { return path.join(assertRunRoot(root), 'owner-manifest.json'); }

function writeManifest(root, manifest) {
  const target = manifestPath(root);
  const temp = path.join(root, `.owner-manifest-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function readManifest(root) {
  const real = assertRunRoot(root);
  const file = path.join(real, 'owner-manifest.json');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('拒絕符號連結台帳');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record.schema !== 1 || record.root !== real || !String(record.runId || '').match(/^[\da-f-]{36}$/)) {
    throw new Error('無效或不屬於此 run 的台帳');
  }
  if (!Array.isArray(record.children) || !Array.isArray(record.ports)) throw new Error('台帳結構錯誤');
  return record;
}

// 「存活」不足以證明所有權：必須同時確認 PID、process start marker、獨有啟動參數。
function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    const opts = { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] };
    const started = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], opts).trim();
    const command = execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], opts).trim();
    if (!started || !command || /<defunct>|\(zombie\)/i.test(command)) return null;
    return { started, command };
  } catch { return null; }
}

function ownership(child, record) {
  if (!record || !Number.isSafeInteger(record.pid) || record.pid <= 0) return { state: 'unverified' };
  const actual = processIdentity(record.pid);
  if (!actual) return { state: 'absent' };
  if (!record.started || !record.marker || actual.started !== record.started || !actual.command.includes(record.marker)) {
    return { state: 'unverified' };
  }
  return { state: 'owned' };
}

function validChildRecord(root, record) {
  return record && Number.isSafeInteger(record.pid) && record.pid > 0
    && typeof record.started === 'string' && record.started.length > 0
    && typeof record.marker === 'string' && record.marker.includes(root + path.sep)
    && record.marker.length <= 512;
}

async function terminateChild(record, root, { graceMs = 600 } = {}) {
  if (!validChildRecord(root, record)) return { pid: record && record.pid, state: 'unverified' };
  let state = ownership(null, record).state;
  if (state === 'absent') return { pid: record.pid, state: 'already-exited' };
  if (state !== 'owned') return { pid: record.pid, state: 'unverified' };
  try { process.kill(record.pid, 'SIGTERM'); } catch (error) {
    if (error.code === 'ESRCH') return { pid: record.pid, state: 'already-exited' };
    return { pid: record.pid, state: 'signal-failed', code: error.code || 'UNKNOWN' };
  }
  const until = Date.now() + graceMs;
  while (Date.now() < until) {
    await sleep(40);
    state = ownership(null, record).state;
    if (state === 'absent') return { pid: record.pid, state: 'terminated' };
    if (state !== 'owned') return { pid: record.pid, state: 'unverified' };
  }
  // 僅對重新核對後仍為相同身分的程序送 SIGKILL。
  if (ownership(null, record).state !== 'owned') return { pid: record.pid, state: 'unverified' };
  try { process.kill(record.pid, 'SIGKILL'); } catch (error) {
    if (error.code === 'ESRCH') return { pid: record.pid, state: 'terminated' };
    return { pid: record.pid, state: 'signal-failed', code: error.code || 'UNKNOWN' };
  }
  for (let i = 0; i < 25; i++) {
    await sleep(40);
    if (ownership(null, record).state === 'absent') return { pid: record.pid, state: 'terminated' };
  }
  return { pid: record.pid, state: 'unverified' };
}

function removeDisposable(root) {
  const real = assertRunRoot(root);
  const removed = [];
  for (const item of DISPOSABLE) {
    const target = path.join(real, item);
    // 僅允許固定名稱的 run 子目錄，不接受外部 manifest 提供的刪除位置。
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(item);
  }
  return removed;
}

function createRun({ caseId = 'unnamed', port = BRIDGE_PORT, metadata = {} } = {}) {
  if (port !== BRIDGE_PORT) throw new Error('T-046 僅允許隔離 Bridge 埠 8799；動態埠須先另行驗證 pin 契約');
  if (typeof caseId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(caseId)) throw new Error('無效 caseId');
  const runId = crypto.randomUUID();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), PREFIX)));
  const paths = {
    profiles: path.join(root, 'profiles'),
    profile: path.join(root, 'profiles', 'default'),
    workspace: path.join(root, 'workspace'),
    ports: path.join(root, 'ports'),
    logs: path.join(root, 'logs'),
    artifacts: path.join(root, 'artifacts'),
  };
  for (const name of ['profiles', 'profile', 'workspace', 'ports', 'logs', 'artifacts']) fs.mkdirSync(paths[name], { recursive: true });
  const owner = processIdentity(process.pid);
  const manifest = {
    schema: 1, runId, root, caseId, status: 'RUNNING',
    createdAt: new Date().toISOString(), endedAt: null,
    owner: { pid: process.pid, started: owner && owner.started || null },
    paths, ports: [{ port: BRIDGE_PORT, state: 'planned', pid: null }],
    children: [], exitCode: null,
    metadata: { ...versionMetadata(), ...metadata, nodeVersion: process.version },
    cleanup: { state: 'pending', processes: [], directories: [] },
  };
  writeManifest(root, manifest);
  let closed = false;
  const spawning = new Set();

  async function spawnOwned(executable, args, { marker, env = process.env } = {}) {
    if (closed) throw new Error('run 已結束，不得啟動子程序');
    if (!Array.isArray(args) || typeof marker !== 'string' || !marker.includes(root + path.sep) || !args.includes(marker)) {
      throw new Error('子程序必須以 run 專有 profile／workspace 啟動參數證明身分');
    }
    // 在任何 await 前將啟動流程加入集合，finalize 必須等登記完成才能清理。
    const operation = (async () => {
      const child = spawn(executable, args, { env, stdio: 'ignore', detached: false });
      try {
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        const actual = processIdentity(child.pid);
        if (!actual || !actual.command.includes(marker)) throw new Error('無法確認子程序 PID／啟動參數');
        const record = { pid: child.pid, started: actual.started, marker, state: 'running' };
        manifest.children.push(record);
        writeManifest(root, manifest);
        return child;
      } catch (error) {
        // 只有本函式直接建立的 child 可以在無台帳時發出停止訊號。
        try { child.kill('SIGTERM'); } catch {}
        throw error;
      }
    })();
    spawning.add(operation);
    try { return await operation; } finally { spawning.delete(operation); }
  }

  async function finalize(status = 'PASS', { exitCode = null, signal = null } = {}) {
    if (closed) return readManifest(root);
    closed = true;
    // 取消與 spawn 事件同時抵達時，先取得 PID 身分／台帳，再移除目錄。
    if (spawning.size) await Promise.allSettled(Array.from(spawning));
    manifest.status = status;
    manifest.endedAt = new Date().toISOString();
    manifest.exitCode = Number.isInteger(exitCode) ? exitCode : null;
    if (signal) manifest.signal = signal;
    writeManifest(root, manifest); // 在清理前持久保存，以便強制中斷可復原。
    const processes = [];
    for (const record of manifest.children.slice().reverse()) processes.push(await terminateChild(record, root));
    manifest.cleanup.processes = processes;
    if (processes.some((p) => !['terminated', 'already-exited'].includes(p.state))) {
      manifest.cleanup.state = 'needs-manual-review';
      writeManifest(root, manifest);
      return manifest;
    }
    try {
      manifest.cleanup.directories = removeDisposable(root);
      manifest.cleanup.state = 'complete';
    } catch (error) {
      manifest.cleanup.state = 'needs-manual-review';
      manifest.cleanup.errorCode = error.code || 'CLEANUP_ERROR';
    }
    writeManifest(root, manifest);
    return manifest;
  }
  return { runId, root, paths, manifest, spawnOwned, finalize };
}

async function runCase(caseId, fn, { timeoutMs = 10000, signal, metadata } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs 必須是正整數');
  const run = createRun({ caseId, metadata });
  const controller = new AbortController();
  let timeout;
  let abortHandler;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      const e = new Error('case timeout'); e.code = 'CASE_TIMEOUT'; reject(e);
    }, timeoutMs);
  });
  const cancellation = new Promise((_, reject) => {
    abortHandler = () => { controller.abort(); const e = new Error('case cancelled'); e.code = 'CASE_CANCELLED'; reject(e); };
    if (signal) {
      if (signal.aborted) abortHandler();
      else signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
  let status = 'PASS';
  try { await Promise.race([Promise.resolve().then(() => {
    if (controller.signal.aborted) return;
    return fn(run, controller.signal);
  }), deadline, cancellation]); }
  catch (error) {
    status = error && error.code === 'CASE_TIMEOUT' ? 'TIMEOUT'
      : error && error.code === 'CASE_CANCELLED' ? 'CANCELLED'
        : error && error.code === 'ERR_ASSERTION' ? 'FAIL_ASSERTION' : 'FAIL_ENVIRONMENT';
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', abortHandler);
  }
  return run.finalize(status);
}

function inspectRun(root) {
  const manifest = readManifest(root);
  const live = manifest.children.map((record) => ({ pid: record.pid, state: validChildRecord(manifest.root, record) ? ownership(null, record).state : 'unverified' }));
  const ownerNow = processIdentity(manifest.owner.pid);
  const ownerActive = !!ownerNow && !!manifest.owner.started && ownerNow.started === manifest.owner.started;
  return { ...manifest, inspection: { ownerActive, children: live } };
}

async function recoverRun(root) {
  const snapshot = inspectRun(root);
  if (snapshot.inspection.ownerActive) throw new Error('原 run owner 仍在執行，拒絕清理');
  const manifest = readManifest(root);
  const processes = [];
  for (const record of manifest.children.slice().reverse()) processes.push(await terminateChild(record, manifest.root));
  manifest.cleanup.processes = processes;
  if (processes.some((p) => !['terminated', 'already-exited'].includes(p.state))) {
    manifest.cleanup.state = 'needs-manual-review';
    writeManifest(manifest.root, manifest);
    return manifest;
  }
  try {
    manifest.cleanup.directories = removeDisposable(manifest.root);
    manifest.cleanup.state = 'complete';
    manifest.status = manifest.status === 'RUNNING' ? 'INTERRUPTED_RECOVERED' : manifest.status;
    if (!manifest.endedAt) manifest.endedAt = new Date().toISOString();
  } catch (error) {
    manifest.cleanup.state = 'needs-manual-review';
    manifest.cleanup.errorCode = error.code || 'CLEANUP_ERROR';
  }
  writeManifest(manifest.root, manifest);
  return manifest;
}

module.exports = { BRIDGE_PORT, createRun, runCase, inspectRun, recoverRun };
