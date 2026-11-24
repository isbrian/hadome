'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../chrome-extension/content.js'), 'utf8');

function createPinnedTab({ dropPluginIdResponse = false } = {}) {
  const sockets = [];
  const timers = new Map();
  const session = new Map();
  const messageListeners = [];
  let timerId = 0;

  class Socket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
    }
    send() {}
    close() { this.fail(); }
    fail() {
      this.readyState = 3;
      if (this.onclose) this.onclose();
    }
  }

  const context = {
    URL,
    URLSearchParams,
    location: { href: 'https://chatgpt.com/?bridge_port=8799', search: '?bridge_port=8799' },
    document: { title: '隔離測試', querySelectorAll: () => [], querySelector: () => null, addEventListener() {} },
    window: { addEventListener() {} },
    navigator: { userAgent: 'isolated-test' },
    sessionStorage: {
      getItem: (k) => session.get(k) || null,
      setItem: (k, v) => session.set(k, String(v)),
      removeItem: (k) => session.delete(k),
    },
    chrome: {
      storage: { local: {
        get(k, cb) {
          if (dropPluginIdResponse && k === 'pluginId') return;
          cb(k === 'pluginId' ? { pluginId: 'isolated-plugin' } : {});
        },
        set() {},
      } },
      runtime: {
        lastError: null,
        sendMessage(_msg, cb) { cb({ chromeTabId: 47 }); },
        onMessage: { addListener(listener) { messageListeners.push(listener); } },
      },
    },
    WebSocket: Socket,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return 0; },
    clearInterval() {},
    console: { log() {}, warn() {}, error() {} },
  };

  vm.runInNewContext(source, context, { filename: 'chrome-extension/content.js' });
  function runNextTimer() {
    const pending = [...timers.entries()];
    assert.ok(pending.length, '預期已有重新連線計時器');
    const [id, timer] = pending[0];
    timers.delete(id);
    timer.fn();
  }
  return { sockets, runNextTimer, dial(port) {
    for (const listener of messageListeners) listener({ kind: 'dial', port }, {}, () => {});
  } };
}

test('T-047：extension storage 回呼未返回時仍須啟動釘選連線', async () => {
  const tab = createPinnedTab({ dropPluginIdResponse: true });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(tab.sockets.length, 0, '回呼未返回前不得假裝已經連線');
  tab.runNextTimer();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(tab.sockets.length, 1, '等待逾時後仍必須建立連線');
  assert.equal(tab.sockets[0].url, 'ws://127.0.0.1:8799', '逾時不可改連正式 8765');
});

test('T-047：明確釘選 8799 的分頁連線失敗後不可退回正式 8765', async () => {
  const tab = createPinnedTab();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(tab.sockets.length, 1, '應先連線至釘選的測試埠');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const socket = tab.sockets.at(-1);
    assert.equal(socket.url, 'ws://127.0.0.1:8799', `第 ${attempt + 1} 次嘗試不得碰正式服務`);
    socket.fail();
    tab.runNextTimer();
  }
  assert.ok(tab.sockets.length >= 6);
  assert.ok(tab.sockets.every((socket) => socket.url === 'ws://127.0.0.1:8799'));
});

test('T-047: 試験専用タブは通常枠からの dial を拒否する', async () => {
  const tab = createPinnedTab();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(tab.sockets.length, 1);
  for (const port of [8765, 8766, 8779]) tab.dial(port);
  assert.equal(tab.sockets.length, 1, '通常枠への接続を開始してはならない');
  assert.equal(tab.sockets[0].readyState, 0, '既存の接続試行を中断してはならない');
  assert.ok(tab.sockets.every(socket => socket.url === 'ws://127.0.0.1:8799'));
});
