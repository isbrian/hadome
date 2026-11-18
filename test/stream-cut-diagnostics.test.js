'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const injectedSource = fs.readFileSync(path.join(__dirname, '../chrome-extension/injected.js'), 'utf8');

async function simulateReadFailure({ completedBeforeError }) {
  const posts = [];
  let resolveCut;
  const cutArrived = new Promise((resolve) => { resolveCut = resolve; });
  const pageStream = new ReadableStream({ start(controller) { controller.close(); } });
  const parsedEvent = { type: completedBeforeError ? 'message_stream_complete' : 'message_delta' };
  const encodedEvent = new TextEncoder().encode('data: ' + JSON.stringify(parsedEvent) + '\n\n');
  let readCount = 0;
  const monitorStream = {
    getReader() {
      return {
        async read() {
          readCount += 1;
          if (readCount === 1) return { done: false, value: encodedEvent };
          throw new Error('signal is aborted without reason');
        },
      };
    },
  };
  const location = {
    origin: 'https://chatgpt.com',
    href: 'https://chatgpt.com/c/synthetic-test',
    search: '',
  };
  const window = {
    location,
    addEventListener() {},
    postMessage(message) {
      posts.push(message);
      if (message.kind === 'stream_cut') resolveCut(message.payload);
    },
    async fetch() {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: { tee: () => [pageStream, monitorStream] },
      };
    },
  };

  vm.runInNewContext(injectedSource, {
    window, location, URL, URLSearchParams, TextDecoder, Response, setInterval, clearInterval,
  }, { filename: 'chrome-extension/injected.js' });
  await window.fetch('https://chatgpt.com/backend-api/conversation', { method: 'POST', body: '{}' });

  const cut = await Promise.race([
    cutArrived,
    new Promise((_, reject) => setTimeout(() => reject(new Error('沒有收到 stream_cut')), 1500)),
  ]);
  return { cut, posts };
}

test('完成標記後讀取例外不得誤送 error，仍保留中斷診斷', async () => {
  const { cut, posts } = await simulateReadFailure({ completedBeforeError: true });
  assert.equal(cut.why, 'threw');
  assert.equal(cut.message, 'signal is aborted without reason');
  assert.equal(cut.complete, true);
  assert.equal(posts.filter((event) => event.kind === 'error').length, 0);
  const done = posts.filter((event) => event.kind === 'done');
  assert.equal(done.length, 1);
  assert.equal(done[0].payload.complete, true);
});

test('未收到完成標記的讀取例外必須拒絕，維持 complete=false', async () => {
  const { cut, posts } = await simulateReadFailure({ completedBeforeError: false });
  assert.equal(cut.why, 'threw');
  assert.equal(cut.complete, false);
  assert.equal(posts.filter((event) => event.kind === 'error').length, 1);
  assert.equal(posts.filter((event) => event.kind === 'done').length, 0);
});
