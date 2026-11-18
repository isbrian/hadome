'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../chrome-extension/injected.js'), 'utf8');
const TOPIC = 'conversation-turn-t019-isolated';
const ERROR = 'signal is aborted without reason';

async function simulate({ wsDoneFirst }) {
  const posts = [];
  const sockets = [];
  class MockWebSocket {
    constructor() { this.listeners = new Map(); sockets.push(this); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    emitDone() {
      const frame = [{ type: 'message', topic_id: TOPIC, payload: {
        type: 'conversation-turn-stream', payload: { type: 'done' },
      } }];
      this.listeners.get('message')?.({ data: JSON.stringify(frame) });
    }
  }
  const payload = JSON.stringify({ type: 'stream_handoff', options: [
    { type: 'subscribe_ws_topic', topic_id: TOPIC },
  ] });
  const firstChunk = new TextEncoder().encode('data: ' + payload + '\n\n');
  let readCount = 0;
  let releaseRead;
  let enteredSecondRead;
  const secondReadStarted = new Promise((resolve) => { enteredSecondRead = resolve; });
  const holdSecondRead = new Promise((resolve) => { releaseRead = resolve; });
  const monitorStream = {
    getReader() {
      return { async read() {
        readCount++;
        if (readCount === 1) return { done: false, value: firstChunk };
        enteredSecondRead();
        if (wsDoneFirst) await holdSecondRead;
        throw new Error(ERROR);
      } };
    },
  };
  const pageStream = new ReadableStream({ start(controller) { controller.close(); } });
  const location = { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/c/t019-isolated', search: '' };
  const window = {
    location,
    WebSocket: MockWebSocket,
    addEventListener() {},
    postMessage(data) { posts.push(data); },
    async fetch() {
      return { ok: true, status: 200, statusText: 'OK', headers: new Headers(),
        body: { tee: () => [pageStream, monitorStream] } };
    },
  };
  vm.runInNewContext(source, {
    window, location, URL, URLSearchParams, TextDecoder, Response,
    setInterval, clearInterval,
  }, { filename: 'chrome-extension/injected.js' });
  const ws = new window.WebSocket('wss://ws.chatgpt.com/t019');
  await window.fetch('https://chatgpt.com/backend-api/conversation', { method: 'POST', body: '{}' });
  await secondReadStarted;
  if (wsDoneFirst) {
    ws.emitDone();
    releaseRead();
  } else {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(posts.filter((p) => p.kind === 'error').length, 0);
    assert.equal(posts.filter((p) => p.kind === 'done').length, 0);
    ws.emitDone();
  }
  await new Promise((resolve) => setImmediate(resolve));
  return posts;
}

test('HTTP 監聽失敗不會中斷已交接的 WebSocket 續傳', async () => {
  const posts = await simulate({ wsDoneFirst: false });
  assert.equal(posts.filter((p) => p.kind === 'error').length, 0);
  const done = posts.filter((p) => p.kind === 'done');
  assert.equal(done.length, 1);
  assert.equal(done[0].payload.complete, true);
  const cuts = posts.filter((p) => p.kind === 'stream_cut');
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].payload.why, 'threw');
});

test('WebSocket 已完成時，後來的 HTTP 讀取失敗不會重複完成', async () => {
  const posts = await simulate({ wsDoneFirst: true });
  assert.equal(posts.filter((p) => p.kind === 'error').length, 0);
  const done = posts.filter((p) => p.kind === 'done');
  assert.equal(done.length, 1);
  assert.equal(done[0].payload.complete, true);
});
