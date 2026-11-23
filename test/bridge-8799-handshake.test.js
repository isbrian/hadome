'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const WebSocket = require('ws');

const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-t047-ports-'));
process.env.CHATGPT_BRIDGE_PORTS_DIR = lockDir;
const { openBridge, EXPECTED_TAB_PROTOCOL } = require('../src/bridge');

async function connected() {
  const ws = new WebSocket('ws://127.0.0.1:8799');
  await once(ws, 'open');
  return ws;
}

async function message(ws, data) {
  const received = once(ws, 'message');
  ws.send(JSON.stringify(data));
  const [payload] = await received;
  return JSON.parse(String(payload));
}

test('T-047：真實隔離 Bridge 僅接受 pinnedPort=8799 的 hello 並回傳 protocol 62', { timeout: 10000 }, async (t) => {
  assert.equal(EXPECTED_TAB_PROTOCOL, 62);
  let bridge;
  t.after(() => fs.rmSync(lockDir, { recursive: true, force: true }));
  try {
    bridge = await openBridge({ port: 8799, workspace: lockDir });
    assert.equal(bridge.port, 8799);
    const bad = await connected();
    try {
      const answer = await message(bad, { type: 'hello', tabId: 'bad-pin', pinnedPort: 8765, protocol: 62 });
      assert.equal(answer.type, 'not_target');
      assert.equal(bridge.connected(), false);
    } finally { bad.terminate(); }
    const good = await connected();
    try {
      const answer = await message(good, {
        type: 'hello', tabId: 'isolated-t047', chromeTabId: 47,
        pluginId: 'isolated-plugin', url: 'https://chatgpt.com/?bridge_port=8799',
        title: '隔離測試', pinnedPort: 8799, protocol: 62,
      });
      assert.deepEqual({ type: answer.type, protocol: answer.protocol }, { type: 'welcome', protocol: 62 });
      assert.equal(bridge.connected(), true);
      assert.equal(bridge.tabProtocol(), 62);
      assert.equal(bridge.chromeTabId(), 47);
    } finally { good.terminate(); }
  } finally { if (bridge) bridge.close(); }
});
