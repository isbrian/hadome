'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const portlock = require('../src/portlock');

test('mainPorts は予約枠を飛ばした 8 席を返す', () => {
  assert.deepEqual(portlock.mainPorts(), [8765, 8766, 8770, 8771, 8772, 8773, 8774, 8775]);
});

test('slotIndexOf は席の番号を返し、予約枠には -1 を返す', () => {
  assert.equal(portlock.slotIndexOf(8765), 0);
  assert.equal(portlock.slotIndexOf(8766), 1);
  assert.equal(portlock.slotIndexOf(8770), 2);
  assert.equal(portlock.slotIndexOf(8775), 7);
  for (const p of portlock.RESERVED) assert.equal(portlock.slotIndexOf(p), -1);
  assert.equal(portlock.slotIndexOf(9000), -1);
});

test('subBaseFor は席ごとに重ならない区画を返す', () => {
  const bases = portlock.mainPorts().map((p) => portlock.subBaseFor(p, 8810));
  assert.deepEqual(bases, [8810, 8818, 8826, 8834, 8842, 8850, 8858, 8866]);

  const seen = new Set();
  for (const base of bases) {
    for (let p = base; p < base + portlock.SUB_BLOCK; p += 1) {
      assert.equal(seen.has(p), false, `${p} が二度使われています`);
      seen.add(p);
    }
  }

  assert.equal(Math.min(...seen), 8810);
  assert.equal(Math.max(...seen), 8873);
});

test('下請けの区画は主の枠と重ならない', () => {
  const mains = new Set(portlock.mainPorts());
  for (const p of portlock.mainPorts()) {
    const base = portlock.subBaseFor(p, 8810);
    for (let q = base; q < base + portlock.SUB_BLOCK; q += 1) {
      assert.equal(mains.has(q), false, `下請けの ${q} が主の枠と重なっています`);
      assert.equal(q > portlock.PORT_TO, true);
    }
  }
});

test('席にない枠は既定の base へ戻す', () => {
  assert.equal(portlock.subBaseFor(9000, 8810), 8810);
  assert.equal(portlock.subBaseFor(8768, 8810), 8810);
});
