'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../chrome-extension/content.js'), 'utf8');

function createPinnedTab({ storageMode = 'never', storageDelayMs = 0 } = {}) {
  const sockets = [];
  const timers = new Map();
  const session = new Map();
  const storageWrites = [];
  let now = 1000000;
  let timerId = 0;

  class Socket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(data) { this.sent.push(JSON.parse(String(data))); }
    close() { this.fail(); }
    fail() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      if (this.onclose) this.onclose();
    }
    open() {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }
    welcome() {
      if (this.onmessage) this.onmessage({ data: JSON.stringify({ type: 'welcome', protocol: 62 }) });
    }
  }

  class FakeDate extends Date {
    static now() { return now; }
  }

  function schedule(fn, delay) {
    const id = ++timerId;
    timers.set(id, { fn, at: now + Number(delay || 0) });
    return id;
  }

  async function advance(ms) {
    const target = now + ms;
    let count = 0;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      if (++count > 1000) throw new Error('fake timer runaway');
      const [id, timer] = due;
      timers.delete(id);
      now = timer.at;
      timer.fn();
      await Promise.resolve();
    }
    now = target;
    await Promise.resolve();
  }

  const context = {
    URL,
    URLSearchParams,
    Date: FakeDate,
    location: { href: 'https://chatgpt.com/?bridge_port=8799', search: '?bridge_port=8799' },
    document: {
      title: 'T-047 初始化隔離測試',
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
    },
    window: { addEventListener() {} },
    navigator: { userAgent: 't047-isolated-test' },
    sessionStorage: {
      getItem: (key) => session.get(key) || null,
      setItem: (key, value) => session.set(key, String(value)),
      removeItem: (key) => session.delete(key),
    },
    chrome: {
      storage: {
        local: {
          get(key, callback) {
            if (key !== 'pluginId') {
              callback({});
              return;
            }
            if (storageMode === 'immediate') {
              callback({ pluginId: 'stored-plugin-id' });
            } else if (storageMode === 'delayed') {
              schedule(() => callback({ pluginId: 'stored-plugin-id' }), storageDelayMs);
            }
          },
          set(value) { storageWrites.push(value); },
        },
      },
      runtime: {
        lastError: null,
        sendMessage(_message, callback) { callback({ chromeTabId: 47 }); },
        onMessage: { addListener() {} },
      },
    },
    WebSocket: Socket,
    setTimeout: schedule,
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return 0; },
    clearInterval() {},
    console: { log() {}, warn() {}, error() {} },
  };

  vm.runInNewContext(source, context, { filename: 'chrome-extension/content.js' });
  return { sockets, storageWrites, advance };
}

function helloFrom(socket) {
  return socket.sent.find((message) => message.type === 'hello');
}

test('T-047：storage.local.get 永不回呼時，釘選 8799 仍須開始連線', async () => {
  const tab = createPinnedTab({ storageMode: 'never' });
  await tab.advance(2000);

  assert.equal(tab.sockets.length, 1, '初始化逾時後應建立 WebSocket');
  assert.equal(tab.sockets[0].url, 'ws://127.0.0.1:8799');
  tab.sockets[0].open();

  const hello = helloFrom(tab.sockets[0]);
  assert.ok(hello, 'WebSocket open 後應送出 hello');
  assert.match(hello.pluginId, /^p-/);
  assert.equal(tab.storageWrites.length, 0, 'storage 永不回呼時不可將臨時身分持久化');
});

test('T-047：storage callback 逾時後才返回，不得更換已送出的 pluginId', async () => {
  const tab = createPinnedTab({ storageMode: 'delayed', storageDelayMs: 2000 });
  await tab.advance(1600);

  assert.equal(tab.sockets.length, 1, '逾時後應先以 fallback 身分建立連線');
  tab.sockets[0].open();
  const firstHello = helloFrom(tab.sockets[0]);
  assert.ok(firstHello);
  const firstPluginId = firstHello.pluginId;
  assert.match(firstPluginId, /^p-/);
  assert.equal(tab.storageWrites.length, 0, '逾時不得覆寫既有 pluginId');
  tab.sockets[0].welcome();

  await tab.advance(500);
  tab.sockets[0].fail();
  await tab.advance(3500);

  assert.equal(tab.sockets.length, 2, '斷線後應重新連線');
  assert.equal(tab.sockets[1].url, 'ws://127.0.0.1:8799');
  tab.sockets[1].open();

  const secondHello = helloFrom(tab.sockets[1]);
  assert.ok(secondHello);
  assert.equal(secondHello.pluginId, firstPluginId, '晚到 callback 不得旋轉分頁身分');
});

test('T-047：storage callback 正常及時返回時，沿用既有 pluginId', async () => {
  const tab = createPinnedTab({ storageMode: 'delayed', storageDelayMs: 500 });
  await tab.advance(600);

  assert.equal(tab.sockets.length, 1);
  assert.equal(tab.sockets[0].url, 'ws://127.0.0.1:8799');
  tab.sockets[0].open();
  assert.equal(helloFrom(tab.sockets[0]).pluginId, 'stored-plugin-id');
});
