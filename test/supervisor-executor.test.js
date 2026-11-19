'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeSupervisor } = require('../src/supervisor');

function fixture(t) {
  // ponytail: stdlib: 一時ディレクトリでテストを隔離 | upgrade if: 永続的な試験環境が必要になった場合
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-t023-executor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, workspace: 'offline-executor', now: () => 1000 };
}

test('M3: 成功結果が永続化され、同じタスクを二重実行しない', async (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1', payload: { text: 'safe' } });
  let calls = 0;
  const executor = async (task) => {
    calls += 1;
    assert.deepEqual(task.payload, { text: 'safe' });
    return { status: 'success', output: 'verified result' };
  };
  const result = await s.runOnce({ owner: 'fake-A', leaseMs: 5000, executor });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result.output, 'verified result');
  assert.equal(result.attempts, 1);
  assert.equal(makeSupervisor(options).get('t-1').result.output, 'verified result');
  assert.equal(await makeSupervisor(options).runOnce({ owner: 'fake-B', executor }), null);
  assert.equal(calls, 1);
});

test('M3: 副作用なしと明示した一時失敗だけ再試行する', async (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  let calls = 0;
  const executor = async () => ++calls < 3
    ? { status: 'failure', retryable: true, noSideEffects: true, reason: 'temporary' }
    : { status: 'success', output: 'done' };
  const first = await s.runOnce({ owner: 'fake-A', executor });
  assert.equal(first.status, 'pending');
  assert.equal(first.attempts, 1);
  assert.equal(first.result.reason, 'temporary');
  assert.equal(makeSupervisor(options).get('t-1').status, 'pending');
  const second = await makeSupervisor(options).runOnce({ owner: 'fake-B', executor });
  assert.equal(second.status, 'pending');
  const third = await s.runOnce({ owner: 'fake-C', executor });
  assert.equal(third.status, 'succeeded');
  assert.equal(third.attempts, 3);
  assert.equal(calls, 3);
});

test('M3: 明示的に安全な失敗でも再試行上限三回で停止する', async (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  let calls = 0;
  const executor = async () => {
    calls += 1;
    return { status: 'failure', retryable: true, noSideEffects: true, reason: 'temporary' };
  };
  assert.equal((await s.runOnce({ owner: 'fake-A', executor })).status, 'pending');
  assert.equal((await s.runOnce({ owner: 'fake-B', executor })).status, 'pending');
  const last = await s.runOnce({ owner: 'fake-C', executor });
  assert.equal(last.status, 'failed');
  assert.equal(last.attempts, 3);
  assert.equal(await s.runOnce({ owner: 'fake-D', executor }), null);
  assert.equal(calls, 3);
});

test('M3: 再試行可能でも副作用なしの証明がない場合は停止する', async (t) => {
  for (const noSideEffects of [false, undefined]) {
    const options = fixture(t);
    const s = makeSupervisor(options);
    s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
    const result = await s.runOnce({ owner: 'fake-A', executor: async () => ({ status: 'failure', retryable: true, noSideEffects }) });
    assert.equal(result.status, 'failed');
    assert.equal(result.attempts, 1);
    assert.equal(await s.runOnce({ owner: 'fake-B', executor: async () => ({ status: 'success' }) }), null);
  }
});

test('M3: unknown の結果では後続タスクを自動実行しない', async (t) => {
  const s = makeSupervisor(fixture(t));
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  s.enqueue({ id: 't-2', idempotencyKey: 'key-2' });
  const result = await s.runOnce({ owner: 'fake-A', executor: async () => ({ status: 'unknown', reason: 'ambiguous' }) });
  assert.equal(result.status, 'unknown');
  assert.equal(result.result.reason, 'ambiguous');
  assert.equal(await s.runOnce({ owner: 'fake-B', executor: async () => ({ status: 'success' }) }), null);
  assert.equal(s.get('t-2').status, 'pending');
});

test('M3: 実行器の例外は unknown として保全し再実行しない', async (t) => {
  const options = fixture(t);
  const s = makeSupervisor(options);
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  const result = await s.runOnce({ owner: 'fake-A', executor: async () => { throw new Error('executor interrupted'); } });
  assert.equal(result.status, 'unknown');
  assert.equal(result.result.status, 'unknown');
  assert.equal(makeSupervisor(options).get('t-1').status, 'unknown');
  assert.equal(await s.runOnce({ owner: 'fake-B', executor: async () => ({ status: 'success' }) }), null);
});

test('M3: 実行器未指定のときは領取前に拒否する', async (t) => {
  const s = makeSupervisor(fixture(t));
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  await assert.rejects(s.runOnce({ owner: 'fake-A' }), /executor/i);
  assert.equal(s.get('t-1').status, 'pending');
});

test('M3: 並行 runOnce でも executor は一回しか呼ばれない', async (t) => {
  const s = makeSupervisor(fixture(t));
  s.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  s.enqueue({ id: 't-2', idempotencyKey: 'key-2' });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const first = s.runOnce({ owner: 'fake-A', executor: async () => {
    calls += 1;
    notifyStarted();
    await gate;
    return { status: 'success', output: 'done' };
  } });
  await started;
  const second = await s.runOnce({ owner: 'fake-B', executor: async () => {
    calls += 1;
    return { status: 'success' };
  } });
  assert.equal(second, null);
  release();
  assert.equal((await first).status, 'succeeded');
  assert.equal(calls, 1);
  assert.equal(s.get('t-2').status, 'pending');
});
