'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decideAutoHandoff, mutationFingerprint, buildHandoffMessage } = require('../src/auto-handoff');

const usage = (chars) => ({ chars, turns: 5 });

test('未啟用時不自動交接', () => {
  assert.equal(decideAutoHandoff({ enabled: false, usage: usage(10000), window: 1000 }).handoff, false);
});

test('未知上下文上限不猜測', () => {
  assert.equal(decideAutoHandoff({ enabled: true, usage: usage(10000), window: 0 }).reason, 'unknown-window');
});

test('達 75% 時才交接', () => {
  assert.equal(decideAutoHandoff({ enabled: true, usage: usage(1198), window: 1000 }).handoff, false);
  assert.equal(decideAutoHandoff({ enabled: true, usage: usage(1200), window: 1000 }).handoff, true);
});

test('有背景子代理時不可交接', () => {
  assert.equal(decideAutoHandoff({ enabled: true, usage: usage(1200), window: 1000, pending: 1 }).reason, 'background-pending');
});

test('交接次數達上限時停止觸發', () => {
  assert.equal(decideAutoHandoff({ enabled: true, usage: usage(1200), window: 1000, count: 2, max: 2 }).reason, 'limit');
});

test('工具呼叫指紋排除 id 與鍵值順序', () => {
  const a = { bridge_tool: 'edit_file', id: 'x', path: 'a.js', old_text: 'a', new_text: 'b' };
  const b = { id: 'y', new_text: 'b', path: 'a.js', bridge_tool: 'edit_file', old_text: 'a' };
  assert.equal(mutationFingerprint(a), mutationFingerprint(b));
  assert.equal(mutationFingerprint(a), mutationFingerprint({ bridge_tool: 'edit_file', input: { path: 'a.js', old_text: 'a', new_text: 'b' } }));
  assert.notEqual(mutationFingerprint(a), mutationFingerprint({ bridge_tool: 'edit_file', input: { path: 'other.js', old_text: 'a', new_text: 'b' } }));
  assert.notEqual(mutationFingerprint(a), mutationFingerprint({ bridge_tool: 'write_file', input: { path: 'a.js', old_text: 'a', new_text: 'b' } }));
  assert.equal(mutationFingerprint({ bridge_tool: 'read_file', path: 'a.js' }), '');
});

test('交接資料保留目標與待辦、執行結果', () => {
  const message = buildHandoffMessage({
    task: '修正 T-019',
    todos: [{ content: '補測試', status: 'in_progress' }],
    journal: [{ tool: 'edit_file', target: 'src/agent.js', ok: true, output: '修改成功' }],
    lastResults: [{ tool: 'run_command', target: 'node --test', ok: false, output: 'exit 1' }],
    answers: ['先修 bug'],
    pending: '上一輪尚未送出的詳細結果',
  });
  for (const expected of ['修正 T-019', '補測試', 'in_progress', 'src/agent.js', 'exit 1', '先修 bug', '上一輪尚未送出的詳細結果', '不得因換對話而重做']) {
    assert.ok(message.includes(expected), expected);
  }
});

test('過長的紀錄會明確標示截斷', () => {
  const message = buildHandoffMessage({ journal: [{ tool: 'read_file', output: 'X'.repeat(6000) }] });
  assert.ok(message.includes('未帶入'));
  assert.ok(message.length < 6000);
});
