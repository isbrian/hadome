'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTopology } = require('../tools/lib/t047-network-preflight');

const valid = () => ({ platform: 'linux', uid: 1001, linkNames: ['lo'], interfaces: { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }, { address: '::1', family: 'IPv6', internal: true }] }, ipv4Routes: [], ipv6Routes: [] });

test('T047：只允許非 root Linux loopback 拓樸', () => {
  assert.equal(validateTopology(valid()), true);
});

test('T047：拒絕非 Linux 或 root 執行環境', () => {
  assert.throws(() => validateTopology({ ...valid(), platform: 'darwin' }));
  assert.throws(() => validateTopology({ ...valid(), uid: 0 }));
  assert.throws(() => validateTopology({ ...valid(), uid: undefined }));
});

test('T047：拒絕額外網路介面，即使沒有配置 IP', () => {
  const input = valid();
  input.interfaces.eth0 = [];
  assert.throws(() => validateTopology(input));
});

test('T047：拒絕不完整或非 loopback 位址', () => {
  assert.throws(() => validateTopology({ ...valid(), interfaces: {} }));
  const input = valid();
  input.interfaces.lo.push({ address: '192.0.2.1', family: 'IPv4', internal: false });
  assert.throws(() => validateTopology(input));
});

test('T047：拒絕 IPv4 或 IPv6 非 loopback 路由', () => {
  assert.throws(() => validateTopology({ ...valid(), ipv4Routes: [{ dev: 'eth0', dst: 'default' }] }));
  assert.throws(() => validateTopology({ ...valid(), ipv6Routes: [{ dev: 'eth0', dst: '2001:db8::/64' }] }));
});

test('T047：缺少路由證據時不得通過', () => {
  assert.throws(() => validateTopology({ ...valid(), ipv4Routes: null }));
  assert.throws(() => validateTopology({ ...valid(), ipv6Routes: undefined }));
});

test('T047：核心介面清單缺失或存在未配置 IP 的介面時必須拒絕', () => {
  assert.throws(() => validateTopology({ ...valid(), linkNames: undefined }));
  assert.throws(() => validateTopology({ ...valid(), linkNames: ['lo', 'eth0'] }));
});

test('T047：實際拓樸收集器必須讀取核心介面及 IPv4/IPv6 主路由表', () => {
  const { collectTopology } = require('../tools/lib/t047-network-preflight');
  const calls = [];
  const result = collectTopology({ platform: 'linux', uid: 1001, interfaces: valid().interfaces, exec: (file, args) => {
    calls.push([file, ...args]);
    return JSON.stringify(args.includes('link') ? [{ ifname: 'lo' }] : []);
  } });
  assert.deepEqual(result, valid());
  assert.deepEqual(calls, [['ip', '-j', 'link', 'show'], ['ip', '-j', '-4', 'route', 'show', 'table', 'main'], ['ip', '-j', '-6', 'route', 'show', 'table', 'main']]);
});

test('T047：核心資料取得失敗時不得產生通過證據', () => {
  const { collectTopology } = require('../tools/lib/t047-network-preflight');
  assert.equal(typeof collectTopology, 'function');
  assert.throws(() => collectTopology({ platform: 'linux', uid: 1001, interfaces: valid().interfaces, exec: () => { throw new Error('ip unavailable'); } }), /ip unavailable/);
});
