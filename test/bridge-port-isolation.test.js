'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TEST_PORT, acceptsRoster, acceptsHello } = require('../src/bridge-port-guard');

test('試験枠は既存ブラウザーのタブ一覧を受け取らない', () => {
  assert.equal(TEST_PORT, 8799);
  assert.equal(acceptsRoster(8799), false);
  assert.equal(acceptsRoster(8765), true);
  assert.equal(acceptsRoster(8770), true);
});

test('試験枠は明示的に固定されたタブだけを受け入れる', () => {
  for (const message of [{}, { pinnedPort: 0 }, { pinnedPort: 8765 }, { pinnedPort: '8799' }, null]) {
    assert.equal(acceptsHello(8799, message), false);
  }
  assert.equal(acceptsHello(8799, { pinnedPort: 8799 }), true);
});

test('通常枠の既存接続はピン指定の有無によらず維持する', () => {
  for (const port of [8765, 8766, 8770, 8779]) {
    assert.equal(acceptsHello(port, {}), true);
    assert.equal(acceptsHello(port, { pinnedPort: 8799 }), true);
  }
});
