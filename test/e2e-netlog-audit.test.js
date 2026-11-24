'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditNetLog } = require('../tools/lib/e2e-netlog-audit');
const logEventTypes = { TCP_CONNECT: 1, UDP_CONNECT: 2, UDP_BYTES_SENT: 3, TCP_CONNECT_ATTEMPT: 4, SOCKET_BYTES_RECEIVED: 5 };
const log = events => ({ constants: { logEventTypes }, events });
const event = (type, id, params) => ({ type: logEventTypes[type], source: { id }, params });
const allowed = ['127.0.0.1:8799', '127.0.0.1:49000'];

test('許可済みのローカル接続だけを受け入れる', () => {
  const result = auditNetLog(log([event('TCP_CONNECT', 1, { address_list: allowed })]), allowed);
  assert.equal(result.passed, true);
});
test('通常枠への接続試行を拒否する', () => {
  const result = auditNetLog(log([event('TCP_CONNECT_ATTEMPT', 1, { address: '127.0.0.1:8765' })]), allowed);
  assert.equal(result.passed, false);
});
test('外部 DNS 通信と送信バイト数を記録する', () => {
  const result = auditNetLog(log([event('UDP_CONNECT', 2, { address: '168.95.192.1:53' }), event('UDP_BYTES_SENT', 2, { byte_count: 28 })]), allowed);
  assert.equal(result.passed, false);
  assert.equal(result.transfers[0].bytes, 28);
});
test('外部 TCP の接続先と受信記録を検出する', () => {
  const result = auditNetLog(log([event('TCP_CONNECT', 3, { remote_address: '8.8.8.8:443' }), event('SOCKET_BYTES_RECEIVED', 3, { byte_count: 950 })]), allowed);
  assert.equal(result.passed, false);
  assert.equal(result.transfers[0].bytes, 950);
});
test('接続に失敗した外部 IPv6 も許可しない', () => {
  const result = auditNetLog(log([event('UDP_CONNECT', 4, { address: '[2001:4860:4860::8888]:443', net_error: -109 })]), allowed);
  assert.equal(result.passed, false);
});
test('空または不完全な証跡を合格にしない', () => {
  assert.throws(() => auditNetLog({}, allowed));
  assert.throws(() => auditNetLog(log([]), allowed));
  assert.throws(() => auditNetLog(log([event('UDP_BYTES_SENT', 1, { byte_count: 28 })]), allowed));
});
