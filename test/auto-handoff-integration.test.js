'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.BRIDGE_TURN_PACE_MIN = '0';
process.env.BRIDGE_TURN_PACE_MAX = '0';
process.env.BRIDGE_NO_LAST_MODEL = '1';
const { runAgent } = require('../src/agent');

const call = (id, name, input) => JSON.stringify({ type: 'tool_use', id, name, input });

async function scenario({ fresh = true, throwOnSwitch = false, sameId = false, missingId = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-handoff-'));
  fs.writeFileSync(path.join(root, 'fixture.txt'), '原始資料保留成功\n');
  const messages = [];
  const notices = [];
  const logs = [];
  const switches = [];
  let id = 'conversation-before';
  let currentUsage = 0;
  const bridge = {
    conversationId: () => id,
    conversationUsage: () => ({ chars: currentUsage, turns: messages.length }),
    newConversation: async (url, lifecycle) => {
      switches.push({ url, lifecycle });
      if (throwOnSwitch) throw new Error('mock switch failed');
      if (fresh) {
        if (!sameId) id = missingId ? '' : 'conversation-after';
        currentUsage = 0;
      }
      return { fresh, url: fresh ? 'https://chatgpt.com/c/conversation-after' : 'https://chatgpt.com/c/conversation-before' };
    },
    ask: async (message) => {
      messages.push(message);
      if (messages.length === 1) {
        currentUsage = 1200;
        return call('toolu_read_one', 'read_file', { path: 'fixture.txt' });
      }
      return call('toolu_finish', 'done', { summary: '已讀取原始資料並完成續作' });
    },
  };
  try {
    const result = await runAgent({
      bridge, root, task: '依照原始資料完成續作', includeInstruction: false,
      autoHandoff: true, contextWindow: 1000, maxHandoffs: 2,
      maxTurns: 3, requireRestorePoint: false, readOnly: true,
      restartGapMs: 0, onNotice: (notice) => notices.push(notice),
      onLog: (entry) => logs.push(String(entry)),
    });
    return { result, messages, notices, switches, logs };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('代理回合達 75% 後在新對話接續原任務，且只切換一次', async () => {
  const { result, messages, notices, switches, logs } = await scenario();
  assert.equal(result.status, 'done', JSON.stringify({ reason: result.reason, messages: messages.map((x) => x.slice(0, 300)), notices, switches, logs, history: result.history }, null, 2));
  assert.equal(messages.length, 2);
  assert.equal(switches.length, 1);
  assert.deepEqual(switches[0].lifecycle, {
    reason: 'auto-context-handoff', actor: 'agent-auto', gapMs: 0,
  });
  assert.match(messages[1], /依照原始資料完成續作/);
  assert.match(messages[1], /fixture\.txt/);
  assert.match(messages[1], /原始資料保留成功/);
  assert.ok(notices.some((n) => n.kind === 'autoHandoff'));
});

test('沒有確認新對話時停止，不再送出舊工具結果', async () => {
  const { result, messages, notices, switches } = await scenario({ fresh: false });
  assert.equal(result.status, 'stopped');
  assert.match(result.reason, /自動交接失敗/);
  assert.equal(messages.length, 1);
  assert.equal(switches.length, 1);
  assert.ok(notices.some((n) => n.kind === 'autoHandoffFailed'));
});

test('切換例外時停止，不會重送訊息', async () => {
  const { result, messages, notices, switches } = await scenario({ throwOnSwitch: true });
  assert.equal(result.status, 'stopped');
  assert.match(result.reason, /mock switch failed/);
  assert.equal(messages.length, 1);
  assert.equal(switches.length, 1);
  assert.ok(notices.some((n) => n.kind === 'autoHandoffFailed'));
});


test('交接後第二回合仍阻止交接前已成功的相同寫入', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-handoff-replay-'));
  const messages = [];
  const tools = [];
  let id = 'conversation-before';
  let currentUsage = 0;
  const write = (callId) => call(callId, 'write_file', { path: 'fixture.txt', content: '原始寫入\n' });
  const bridge = {
    conversationId: () => id,
    conversationUsage: () => ({ chars: currentUsage, turns: messages.length }),
    newConversation: async () => {
      id = 'conversation-after';
      currentUsage = 0;
      return { fresh: true, url: 'https://chatgpt.com/c/conversation-after' };
    },
    ask: async (message) => {
      messages.push(message);
      if (messages.length === 1) {
        currentUsage = 1200;
        return write('toolu_write_before');
      }
      if (messages.length === 2) return call('toolu_verify_after', 'read_file', { path: 'fixture.txt' });
      if (messages.length === 3) return write('toolu_write_again');
      return call('toolu_finish_after', 'done', { summary: '已驗證重複寫入保護' });
    },
  };
  try {
    const result = await runAgent({
      bridge, root, task: '驗證交接後避免重複寫入', includeInstruction: false,
      autoHandoff: true, contextWindow: 1000, maxHandoffs: 2,
      maxTurns: 4, requireRestorePoint: false, restartGapMs: 0,
      onTool: (entry) => tools.push(entry),
    });
    assert.equal(result.status, 'done', JSON.stringify({ reason: result.reason, tools, messages: messages.length }));
    const writes = tools.filter((x) => x.tool === 'write_file');
    assert.equal(writes.length, 2);
    assert.equal(writes[0].ok, true);
    assert.equal(writes[1].askedAgain, true, JSON.stringify(writes));
    assert.match(writes[1].output, /已阻止重複執行/);
    assert.equal(fs.readFileSync(path.join(root, 'fixture.txt'), 'utf8'), '原始寫入\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('宣稱新對話建立成功但 ID 相同時停止', async () => {
  const { result, messages, notices, switches } = await scenario({ sameId: true });
  assert.equal(result.status, 'stopped');
  assert.match(result.reason, /新舊對話 ID 相同/);
  assert.equal(messages.length, 1);
  assert.equal(switches.length, 1);
  assert.ok(notices.some((n) => n.kind === 'autoHandoffFailed'));
});


test('回報 fresh 但無法取得新對話 ID 時停止', async () => {
  const { result, messages, notices, switches } = await scenario({ missingId: true });
  assert.equal(result.status, 'stopped');
  assert.match(result.reason, /新對話 ID/);
  assert.equal(messages.length, 1);
  assert.equal(switches.length, 1);
  assert.ok(notices.some((n) => n.kind === 'autoHandoffFailed'));
});
