'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');

const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-t019-ports-'));
process.env.CHATGPT_BRIDGE_PORTS_DIR = lockDir;
const { openBridge, EXPECTED_TAB_PROTOCOL } = require('../src/bridge');

test.after(() => fs.rmSync(lockDir, { recursive: true, force: true }));

async function connectMock() {
  const bridge = await openBridge({ port: 0, workspace: 't019-offline-test' });
  const peer = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
  await new Promise((resolve, reject) => {
    peer.once('open', resolve);
    peer.once('error', reject);
  });
  const welcome = waitMessage(peer, 'welcome');
  peer.send(JSON.stringify({
    type: 'hello', tabId: 't019-mock-tab', protocol: EXPECTED_TAB_PROTOCOL,
    url: 'https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'isolated test',
  }));
  await welcome;
  return { bridge, peer };
}

function waitMessage(peer, type) {
  return new Promise((resolve, reject) => {
    const receive = (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch (e) { reject(e); return; }
      if (message.type !== type) return;
      peer.off('message', receive);
      resolve(message);
    };
    peer.on('message', receive);
  });
}

async function exercise(deliver) {
  const { bridge, peer } = await connectMock();
  try {
    const sent = waitMessage(peer, 'send');
    const response = bridge.ask('isolated read-only test');
    // 斷線可能早於 deliver() 返回，立即掛上拒絕處理以避免 unhandledRejection。
    void response.catch(() => {});
    await sent;
    peer.send(JSON.stringify({ type: 'submitted' }));
    peer.send(JSON.stringify({ type: 'delta', text: '{"type":"tool_use","id":"test","name":"write_file"' }));
    await deliver(peer);
    return await response;
  } finally {
    peer.close();
    bridge.close();
  }
}

test('收到部分文字後 error 不得以成功結果交給 Agent', async () => {
  await assert.rejects(
    exercise(async (peer) => {
      peer.send(JSON.stringify({ type: 'error', message: 'signal is aborted without reason' }));
    }),
    (error) => {
      assert.match(error.message, /signal is aborted/);
      assert.match(error.partialText, /write_file/);
      assert.equal(error.delivered, true);
      assert.equal(error.transient, false);
      return true;
    }
  );
});

test('收到部分文字後 WebSocket 關閉不得當成正常完成', async () => {
  await assert.rejects(
    exercise(async (peer) => {
      const closed = new Promise((resolve) => peer.once('close', resolve));
      peer.close();
      await closed;
    }),
    (error) => {
      assert.match(error.partialText, /write_file/);
      assert.equal(error.delivered, true);
      assert.equal(error.transient, false);
      return true;
    }
  );
});

test('收到 complete=true 的 done 仍正常完成', async () => {
  const { bridge, peer } = await connectMock();
  try {
    const sent = waitMessage(peer, 'send');
    const response = bridge.ask('isolated completion test');
    await sent;
    peer.send(JSON.stringify({ type: 'submitted' }));
    peer.send(JSON.stringify({ type: 'done', text: 'completed answer', complete: true }));
    assert.equal(await response, 'completed answer');
  } finally {
    peer.close();
    bridge.close();
  }
});
