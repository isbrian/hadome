'use strict';

// T-047：只驗證網路拓樸，不將此結果視為完整網路隔離或 sandbox 證明。
const assert = require('node:assert/strict');

function validateTopology(snapshot) {
  assert.ok(snapshot && typeof snapshot === 'object', '缺少網路拓樸證據');
  assert.equal(snapshot.platform, 'linux', '必須使用 Linux 隔離環境');
  assert.ok(Number.isSafeInteger(snapshot.uid) && snapshot.uid > 0, '必須以非 root 身分執行');
  assert.ok(snapshot.interfaces && typeof snapshot.interfaces === 'object', '缺少網路介面證據');
  assert.deepEqual(Object.keys(snapshot.interfaces), ['lo'], '只允許 loopback 介面');
  assert.deepEqual(snapshot.linkNames, ['lo'], '核心介面清單必須存在且只有 loopback');
  const addresses = snapshot.interfaces.lo;
  assert.ok(Array.isArray(addresses) && addresses.length === 2, '必須確認 IPv4 及 IPv6 loopback');
  const actual = addresses.map(item => {
    assert.ok(item && item.internal === true, '拒絕非內部網路位址');
    return `${item.family}:${item.address}`;
  }).sort();
  assert.deepEqual(actual, ['IPv4:127.0.0.1', 'IPv6:::1'], '拒絕非預期 loopback 位址');
  for (const key of ['ipv4Routes', 'ipv6Routes']) {
    assert.ok(Array.isArray(snapshot[key]), `缺少 ${key} 路由證據`);
    assert.equal(snapshot[key].length, 0, `拒絕 ${key} 主路由表中的非預期路由`);
  }
  return true;
}

function collectTopology({
  platform = process.platform,
  uid = process.getuid?.(),
  interfaces = require('node:os').networkInterfaces(),
  exec = require('node:child_process').execFileSync,
} = {}) {
  assert.equal(platform, 'linux', '必須在 Linux 取得核心網路證據');
  const read = (args) => {
    const result = JSON.parse(exec('ip', args, { encoding: 'utf8', timeout: 3000 }));
    assert.ok(Array.isArray(result), '無效的核心網路資料');
    return result;
  };
  const linkNames = read(['-j', 'link', 'show']).map(item => item.ifname);
  const ipv4Routes = read(['-j', '-4', 'route', 'show', 'table', 'main']);
  const ipv6Routes = read(['-j', '-6', 'route', 'show', 'table', 'main']);
  return { platform, uid, interfaces, linkNames, ipv4Routes, ipv6Routes };
}

module.exports = { validateTopology, collectTopology };
