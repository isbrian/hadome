'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeSupervisor } = require('../src/supervisor');

function fixture(t, workspace = 'isolated-project') {
  // ponytail: stdlib: OS の専用一時領域を利用 | upgrade if: テストに永続データの共有が必要になった場合
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-t023-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, workspace, now: () => 1000 };
}

test('M1: 保存後に再起動してもタスクを読み込める', (t) => {
  const options = fixture(t);
  const first = makeSupervisor(options);
  const task = first.enqueue({ id: 't-1', idempotencyKey: 'key-1', payload: { text: 'offline' } });
  assert.equal(task.status, 'pending');
  assert.equal(task.workspace, options.workspace);
  assert.equal(task.executor, 'fake');
  assert.equal(task.attempts, 0);
  assert.equal(task.maxAttempts, 3);
  assert.deepEqual(makeSupervisor(options).get('t-1').payload, { text: 'offline' });
  assert.equal(makeSupervisor(options).list().length, 1);
});

test('M1: ID と冪等キーの重複では二重登録しない', (t) => {
  const supervisor = makeSupervisor(fixture(t));
  const first = supervisor.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  assert.equal(supervisor.enqueue({ id: 't-2', idempotencyKey: 'key-1' }).id, first.id);
  assert.throws(() => supervisor.enqueue({ id: 't-1', idempotencyKey: 'key-other' }), /duplicate|already exists/i);
  assert.equal(supervisor.list().length, 1);
});

test('M1: 破損データと未知バージョンを空キューとして扱わない', (t) => {
  const options = fixture(t);
  makeSupervisor(options).enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  const file = path.join(options.root, 'tasks.json');
  fs.writeFileSync(file, '{broken-json', 'utf8');
  assert.throws(() => makeSupervisor(options).list(), /corrupt|invalid|json/i);
  fs.writeFileSync(file, JSON.stringify({ version: 999, workspace: options.workspace, tasks: [] }), 'utf8');
  assert.throws(() => makeSupervisor(options).list(), /version/i);
});

test('M1: 異なる workspace のデータを拒否する', (t) => {
  const options = fixture(t);
  makeSupervisor(options).enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  assert.throws(() => makeSupervisor({ ...options, workspace: 'other-project' }).list(), /workspace/i);
});

test('M1: 不正な状態遷移を拒否し、保存済み状態を変えない', (t) => {
  const supervisor = makeSupervisor(fixture(t));
  supervisor.enqueue({ id: 't-1', idempotencyKey: 'key-1' });
  assert.throws(() => supervisor.transition('t-1', 'succeeded'), /transition|state/i);
  assert.equal(supervisor.get('t-1').status, 'pending');
});
