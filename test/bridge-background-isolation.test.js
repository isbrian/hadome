'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../chrome-extension/background.js'), 'utf8');
function mock(tabs) {
  const sockets = [], dials = [], removed = [];
  class Socket {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(String(data))); }
    close() {}
  }
  const event = { addListener() {} };
  const chrome = {
    runtime: { lastError: null, getManifest: () => ({ version: 'test' }), onMessage: event },
    storage: { local: { get: (_k, cb) => cb({ pluginId: 'test' }), set() {} }, session: { get: (_k, cb) => cb({}), set() {}, remove() {} } },
    tabs: { query: (_q, cb) => cb(tabs), sendMessage: (id, m, cb) => {
      if (m.kind === 'which_port') {
        const t = tabs.find(tab => tab.id === id);
        if (cb) cb(t?.reportedPort === null ? undefined : { port: t?.reportedPort ?? 0 });
        return;
      }
      dials.push({ id, m });
    }, remove: (ids, cb) => { removed.push(...[].concat(ids)); if (cb) cb(); }, onCreated: event, onRemoved: event, onUpdated: event, onActivated: event },
    alarms: { get: (_k, cb) => cb({}), create() {}, onAlarm: event },
  };
  const context = vm.createContext({ chrome, WebSocket: Socket, navigator: { userAgent: 'test' }, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, URL, Date, Map, console });
  vm.runInContext(source, context);
  vm.runInContext('名乗る(true)', context);
  const socket = sockets.find(s => s.url.endsWith(':8765'));
  for (const s of sockets) if (s.onopen) s.onopen();
  return { sockets, dials, removed, roster: socket?.sent[0], request: m => socket.onmessage({ data: JSON.stringify(m) }) };
}
const tab = (id, key) => ({ id, windowId: 1, active: true, url: 'https://chatgpt.com/c/' + key });
test('通常ブラウザーは試験枠を探索しない', () => {
  const h = mock([tab(11, 'before')]);
  assert.ok(h.sockets.length);
  assert.equal(h.sockets.some(s => s.url.endsWith(':8799')), false);
});
test('指定 ID が違う場合は別タブへ代替しない', () => {
  const h = mock([tab(11, 'before')]);
  h.request({ type: 'wantTab', url: '/c/before', chromeTabId: 12 });
  assert.equal(h.dials.length, 0);
  h.request({ type: 'wantTab', url: '/c/before', chromeTabId: 11 });
  assert.equal(h.dials.length, 1);
  assert.equal(h.dials[0].id, 11);
});
test('重複 URL と部分一致は拒否する', () => {
  const h = mock([tab(11, 'before'), tab(12, 'before'), tab(13, 'before-more')]);
  h.request({ type: 'wantTab', url: '/c/before' });
  h.request({ type: 'wantTab', url: '/c/bef' });
  assert.equal(h.dials.length, 0);
  h.request({ type: 'wantTab', url: '/c/before-more' });
  assert.equal(h.dials.length, 1);
  assert.equal(h.dials[0].id, 13);
});

const isolatedTab = (id, key) => ({ ...tab(id, key), url: tab(id, key).url + '?bridge_port=8799' });

test('試験専用タブしかない場合は通常枠への roster 接続を行わない', () => {
  const h = mock([isolatedTab(47, 'isolated')]);
  assert.equal(h.sockets.length, 0);
});

test('通常枠の roster に試験専用タブを含めない', () => {
  const h = mock([tab(11, 'normal'), isolatedTab(47, 'isolated')]);
  assert.ok(h.roster);
  assert.deepEqual(h.roster.windows.flatMap(w => w.tabs.map(t => t.chromeTabId)), [11]);
});

test('通常枠の wantTab を試験専用タブへ転送しない', () => {
  const h = mock([tab(11, 'normal'), isolatedTab(47, 'isolated')]);
  h.request({ type: 'wantTab', url: '/c/isolated', chromeTabId: 47 });
  assert.equal(h.dials.length, 0);
  h.request({ type: 'wantTab', url: '/c/normal', chromeTabId: 11 });
  assert.equal(h.dials.length, 1);
  assert.equal(h.dials[0].id, 11);
});

test('URL からピンが消えても試験枠のタブを通常 roster に含めない', () => {
  const h = mock([tab(11, 'normal'), { ...tab(47, 'isolated'), reportedPort: 8799 }]);
  assert.deepEqual(h.roster.windows.flatMap(w => w.tabs.map(t => t.chromeTabId)), [11]);
  h.request({ type: 'wantTab', url: '/c/isolated', chromeTabId: 47 });
  assert.equal(h.dials.length, 0);
});

test('通常枠の closeTabs は試験専用タブを閉じない', () => {
  const h = mock([tab(11, 'normal'), isolatedTab(47, 'isolated'), { ...tab(48, 'kept-pin'), reportedPort: 8799 }]);
  h.request({ type: 'closeTabs' });
  assert.deepEqual(h.removed, [11]);
});

test('通常枠の closeTabsOnPort は試験枠を操作しない', () => {
  const h = mock([tab(11, 'normal'), { ...isolatedTab(47, 'isolated'), reportedPort: 8799 }]);
  h.request({ type: 'closeTabsOnPort', port: 8799 });
  assert.deepEqual(h.removed, []);
});

test('枠を確認できないタブは通常枠の探索・操作から除外する', () => {
  const h = mock([tab(11, 'normal'), { ...tab(47, 'unknown'), reportedPort: null }]);
  assert.deepEqual(h.roster.windows.flatMap(w => w.tabs.map(t => t.chromeTabId)), [11]);
  h.request({ type: 'wantTab', url: '/c/unknown', chromeTabId: 47 });
  assert.equal(h.dials.length, 0);
  h.request({ type: 'closeTabs' });
  assert.deepEqual(h.removed, [11]);
});
