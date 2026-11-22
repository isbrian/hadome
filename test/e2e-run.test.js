'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { BRIDGE_PORT, createRun, runCase, inspectRun, recoverRun } = require('../tools/lib/e2e-run');

const sleeper = 'setInterval(() => {}, 1000)';
const cleanupTestRoot = (t, root) => t.after(() => fs.rmSync(root, { recursive: true, force: true }));
async function spawnTestChild(run) {
  const marker = run.paths.profile;
  return run.spawnOwned(process.execPath, ['-e', sleeper, marker], { marker });
}

// 不啟動 Bridge、不連 8765，不依賴 Chrome 或登入帳號。
test('T046：每輪使用新的暫存根、固定 8799 台帳與可追溯 runId', async (t) => {
  const first = createRun({ caseId: 'manifest_1', metadata: { browserVersion: null } });
  const second = createRun({ caseId: 'manifest_2' });
  cleanupTestRoot(t, first.root);
  cleanupTestRoot(t, second.root);
  assert.notEqual(first.runId, second.runId);
  assert.notEqual(first.root, second.root);
  assert.ok(first.root.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
  assert.equal(inspectRun(first.root).ports[0].port, BRIDGE_PORT);
  assert.equal(BRIDGE_PORT, 8799);
  for (const location of ['profile', 'profiles', 'workspace', 'ports', 'logs', 'artifacts']) {
    assert.ok(fs.statSync(first.paths[location]).isDirectory());
  }
  assert.equal(inspectRun(first.root).metadata.nodeVersion, process.version);
  await first.finalize('PASS', { exitCode: 0 });
  await second.finalize('NOT_RUN');
  assert.equal(inspectRun(first.root).cleanup.state, 'complete');
  assert.equal(inspectRun(second.root).status, 'NOT_RUN');
  assert.ok(fs.existsSync(path.join(first.root, 'owner-manifest.json')));
  assert.ok(fs.existsSync(first.paths.logs));
  assert.equal(fs.existsSync(first.paths.profile), false);
});

test('T046：成功流程 finally 清理自有子程序和隔離目錄', async (t) => {
  let root;
  let child;
  const result = await runCase('success_case', async (run) => {
    root = run.root;
    child = await spawnTestChild(run);
    assert.ok(child.pid > 0);
  });
  cleanupTestRoot(t, root);
  assert.equal(result.status, 'PASS');
  assert.equal(result.cleanup.state, 'complete');
  assert.equal(result.cleanup.processes.length, 1);
  assert.ok(['terminated', 'already-exited'].includes(result.cleanup.processes[0].state));
  assert.equal(fs.existsSync(path.join(root, 'profiles')), false);
  assert.ok(fs.existsSync(path.join(root, 'owner-manifest.json')));
  assert.ok(fs.existsSync(path.join(root, 'logs')));
});

test('T046：assertion 失敗仍清理，並與環境失敗區別', async (t) => {
  let root;
  const result = await runCase('assertion_case', async (run) => {
    root = run.root;
    await spawnTestChild(run);
    assert.equal('wrong', 'expected');
  });
  cleanupTestRoot(t, root);
  assert.equal(result.status, 'FAIL_ASSERTION');
  assert.equal(result.cleanup.state, 'complete');
  assert.equal(result.cleanup.processes.length, 1);
});

test('T046：逾時後強制清理自有子程序，未回報 PASS', async (t) => {
  let root;
  const result = await runCase('timeout_case', async (run) => {
    root = run.root;
    await spawnTestChild(run);
    await new Promise(() => {});
  }, { timeoutMs: 1500 });
  cleanupTestRoot(t, root);
  assert.equal(result.status, 'TIMEOUT');
  assert.equal(result.cleanup.state, 'complete');
  assert.equal(result.cleanup.processes.length, 1);
});

test('T046：取消時清理已登記子程序，取消不算成功', async (t) => {
  let root;
  let started;
  const spawned = new Promise((resolve) => { started = resolve; });
  const abort = new AbortController();
  const pending = runCase('cancel_case', async (run) => {
    root = run.root;
    await spawnTestChild(run);
    started();
    await new Promise(() => {});
  }, { signal: abort.signal, timeoutMs: 5000 });
  await spawned;
  abort.abort();
  const result = await pending;
  cleanupTestRoot(t, root);
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.cleanup.state, 'complete');
  assert.equal(result.cleanup.processes.length, 1);
});

test('T046：預先取消不執行案例函式，也不留下隔離目錄', async (t) => {
  const abort = new AbortController();
  abort.abort();
  let invoked = false;
  const result = await runCase('pre_cancel_case', async () => { invoked = true; }, { signal: abort.signal });
  cleanupTestRoot(t, result.root);
  assert.equal(invoked, false);
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.cleanup.state, 'complete');
  assert.equal(fs.existsSync(result.paths.profile), false);
});

test('T046：子程序啟動與 finalize 競態時，先完成登記再清理', async (t) => {
  const run = createRun({ caseId: 'spawn_finally_race' });
  cleanupTestRoot(t, run.root);
  const pending = spawnTestChild(run);
  const cleanup = run.finalize('CANCELLED');
  const child = await pending;
  const result = await cleanup;
  assert.ok(child.pid > 0);
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.cleanup.state, 'complete');
  assert.equal(result.cleanup.processes.length, 1);
  assert.equal(fs.existsSync(run.paths.profile), false);
});

test('T046：未確認版本保持 null，並記錄固定 Git 與環境欄位', async (t) => {
  const run = createRun({ caseId: 'metadata_case' });
  cleanupTestRoot(t, run.root);
  const record = inspectRun(run.root);
  assert.match(record.metadata.commit, /^[0-9a-f]{40}$/);
  assert.equal(record.metadata.nodeVersion, process.version);
  assert.ok(Object.hasOwn(record.metadata, 'playwrightCoreVersion'));
  assert.ok(Object.hasOwn(record.metadata, 'browserRevision'));
  assert.ok(Object.hasOwn(record.metadata, 'editorVersion'));
  assert.ok(Object.hasOwn(record.metadata, 'extensionVersion'));
  assert.equal(record.metadata.editorVersion, null);
  assert.equal(record.metadata.protocol, null);
  await run.finalize('NOT_RUN');
});

test('T046：拒絕正式埠及未驗證動態埠，不建立任何 run', () => {
  assert.throws(() => createRun({ caseId: 'formal_port', port: 8765 }), /隔離 Bridge 埠 8799/);
  assert.throws(() => createRun({ caseId: 'unknown_port', port: 0 }), /隔離 Bridge 埠 8799/);
  assert.throws(() => createRun({ caseId: 'other_port', port: 8800 }), /隔離 Bridge 埠 8799/);
});

test('T046：沒有完整身分證據時拒絕 kill，保留 profile 供人工核對', async (t) => {
  const run = createRun({ caseId: 'unknown_owner' });
  cleanupTestRoot(t, run.root);
  run.manifest.children.push({ pid: process.pid, started: 'not-the-current-start', marker: run.paths.profile });
  const report = await run.finalize('BLOCKED');
  assert.equal(report.cleanup.state, 'needs-manual-review');
  assert.equal(report.cleanup.processes[0].state, 'unverified');
  assert.ok(fs.existsSync(run.paths.profile));
  assert.ok(fs.existsSync(path.join(run.root, 'owner-manifest.json')));
});

test('T046：run 活著時拒絕復原，不清掉它的任何目錄', async (t) => {
  const run = createRun({ caseId: 'active_owner' });
  cleanupTestRoot(t, run.root);
  await assert.rejects(recoverRun(run.root), /owner.*執行/);
  assert.ok(fs.existsSync(run.paths.profile));
  await run.finalize('NOT_RUN');
});

test('T046：拒絕操作其他目錄與符號連結，不觸及正式資料', async (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const sentinel = path.join(outside, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'do-not-touch');
  await assert.rejects(recoverRun(outside), /拒絕操作/);
  const run = createRun({ caseId: 'symlink_guard' });
  cleanupTestRoot(t, run.root);
  fs.rmSync(run.paths.workspace, { recursive: true });
  fs.symlinkSync(outside, run.paths.workspace);
  const result = await run.finalize('NOT_RUN');
  assert.equal(result.cleanup.state, 'complete');
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'do-not-touch');
});

test('T046：owner 遭 SIGKILL 後，保留台帳供核對並安全復原自有程序', async (t) => {
  const worker = spawn(process.execPath, [path.join(__dirname, 'e2e-run-orphan-worker.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let root;
  let childPid;
  let output = '';
  let errors = '';
  worker.stdout.on('data', (b) => { output += b.toString(); });
  worker.stderr.on('data', (b) => { errors += b.toString(); });
  t.after(() => {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGTERM');
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });
  const untilReady = async () => {
    const deadline = Date.now() + 5000;
    while (!output.includes('\n') && Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(`worker exited early: ${errors}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!output.includes('\n')) throw new Error(`worker not ready: ${errors}`);
    return JSON.parse(output.split('\n')[0]);
  };
  ({ root, childPid } = await untilReady());
  assert.equal(inspectRun(root).children[0].pid, childPid);
  assert.equal(inspectRun(root).inspection.ownerActive, true);
  worker.kill('SIGKILL');
  await once(worker, 'close');
  assert.equal(inspectRun(root).inspection.ownerActive, false);
  assert.ok(fs.existsSync(path.join(root, 'profiles')));
  const recovered = await recoverRun(root);
  assert.equal(recovered.status, 'INTERRUPTED_RECOVERED');
  assert.equal(recovered.cleanup.state, 'complete');
  assert.equal(recovered.cleanup.processes.length, 1);
  assert.equal(fs.existsSync(path.join(root, 'profiles')), false);
  assert.ok(fs.existsSync(path.join(root, 'owner-manifest.json')));
  assert.ok(fs.existsSync(path.join(root, 'logs')));
});
