'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inferRules, solve } = require('./analyze.cjs');
const { cases, score } = require('./probes.cjs');

function examples(op, rule) {
  return [-12, -11, -10].map(x => ({ expression: { op, value: x }, answer: rule.a * x + rule.b }));
}

test('public examples uniquely determine affine intercepts and compositions', () => {
  const rules = inferRules([...examples('f', { a: 3, b: 1 }), ...examples('g', { a: 4, b: -4 })]);
  assert.deepEqual(rules, { f: { a: 3, b: 1 }, g: { a: 4, b: -4 } });
  assert.deepEqual(solve({ op: 'g', value: { op: 'f', value: 346 } }, rules), { answer: 4152, missing: [] });
});

test('familiar inner context never conceals a missing outer definition', () => {
  const rules = inferRules(examples('f', { a: 3, b: 1 }));
  assert.deepEqual(solve({ op: 'unknown', value: { op: 'f', value: 329 } }, rules),
    { answer: null, missing: ['unknown'] });
});

test('contradictory and insufficient evidence is rejected', () => {
  const rows = examples('f', { a: 3, b: 1 });
  rows[2].answer++;
  assert.throws(() => inferRules(rows), /Contradictory/);
  assert.throws(() => inferRules(rows.slice(0, 1)), /Insufficient/);
});

test('diagnostic tasks and scores preserve named ignorance and invalid confidence', () => {
  const items = cases();
  assert.equal(items.length, 40);
  assert.equal(new Set(items.map(item => item.id)).size, 40);
  const item = items.find(row => row.condition === 'unknown_mixed_examples');
  const correct = { answer: null, confidence: 0, abstain: true, missing: item.missing };
  assert.equal(score(item, correct).correct, true);
  assert.equal(score(item, { ...correct, missing: [] }).correct, false);
  assert.equal(score(item, { ...correct, confidence: '0' }).valid, false);
});
