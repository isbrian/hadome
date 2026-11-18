'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../chrome-extension/background.js'), 'utf8');
function mock(tabs) {
  const sockets = [], dials = [];
  class Socket { constructor(url) { this.url = url; sockets.push(this); } send() {} close() {} }
  const event = { addListener() {} };
  const chrome = {
    runtime: { lastError: null, getManifest: () => ({ version: 'test' }), onMessage: event },
    storage: { local: { get: (_k, cb) => cb({ pluginId: 'test' }), set() {} }, session: { get: (_k, cb) => cb({}), set() {}, remove() {} } },
    tabs: { query: (_q, cb) => cb(tabs), sendMessage: (id, m) => dials.push({ id, m }), onCreated: event, onRemoved: event, onUpdated: event, onActivated: event },
    alarms: { get: (_k, cb) => cb({}), create() {}, onAlarm: event },
  };
  const context = vm.createContext({ chrome, WebSocket: Socket, navigator: { userAgent: 'test' }, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, URL, Date, Map, console });
  vm.runInContext(source, context);
  vm.runInContext('名乗る(true)', context);
  const socket = sockets.find(s => s.url.endsWith(':8765'));
  return { sockets, dials, request: m => socket.onmessage({ data: JSON.stringify(m) }) };
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
