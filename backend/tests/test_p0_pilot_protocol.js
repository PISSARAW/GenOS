'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../benchmarks/p0-pilots/v1');
const protocol = require(path.join(root, 'protocol.json'));
const { compile, execute } = require(path.join(root, 'expression.cjs'));
const { select } = require(path.join(root, 'arm.cjs'));
require(path.join(root, 'environment.cjs')).validateAssets();

for (const pilot of Object.keys(protocol.pilots)) {
  const tasks = require(path.join(root, 'public', pilot + '.json'));
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
  for (const [split, expected] of Object.entries(protocol.splits)) {
    assert.equal(tasks.filter(task => task.split === split).length, expected);
  }
  assert.ok(tasks.filter(task => task.split !== 'train').every(task => task.exampleSolution === undefined));
  assert.ok(protocol.pilots[pilot].arms.includes('genos'));
}
for (const expression of ['require(1)', 'a.constructor', 'Math.abs.constructor(1)', 'a=1', 'a;process.exit()']) {
  assert.throws(() => compile(expression));
}
assert.equal(execute(compile('((a%b)+b)%b'), [-1, 5, 0]), 4);
assert.equal(select('genos', [{ check: { passed: false } }]), -1);
assert.equal(select('genos', [{ check: { passed: true } }, { check: { passed: false } }]), 0);
assert.equal(select('no-evidence-gate', [{ check: { passed: true } }, { check: { passed: false } }]), 1);
assert.equal(Buffer.byteLength(require(path.join(root, 'memory-probe.cjs')).padded('raw', 2048)), 2048);
const proof = 'by\n  intro n\n  rfl';
const theorem = { formalStatement: '∀ n : Nat, n + 0 = n' };
assert.ok(require(path.join(root, 'reasoning-probe.cjs')).sourceFor(theorem, { proof }).endsWith(proof));
assert.throws(() => require(path.join(root, 'reasoning-probe.cjs')).sourceFor(theorem, { proof: 'by sorry' }));
console.log('P0 pilot contracts: versioned disjoint splits, bounded code and evidence selection passed.');
