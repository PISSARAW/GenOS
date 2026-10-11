'use strict';

const assert = require('node:assert/strict');
const { inputs, assertInventory, inventory } = require('./workerQualificationInventory.cjs');

const source = inputs();
const report = inventory(source);
assert.equal(report.kindCount, Object.keys(source.kinds).length);
assert.equal(report.methodCount, source.executors.reduce((sum, entry) => sum + entry.methods.length, 0));
assert.equal(report.benchmarkDigest.startsWith('sha256:'), true);
assert.equal(report.workers.every((entry) => entry.artifact && entry.benchmarkCases.length), true);

assert.throws(() => assertInventory({ ...source, executors: source.executors.slice(1) }), /missing identities/);
assert.throws(() => assertInventory({ ...source, cases: [...source.cases, source.cases[0]] }), /duplicate/);
assert.throws(() => assertInventory({ ...source, cases: source.cases.map((item, index) => index === 0
  ? { ...item, methodContract: { version: 1, methodId: 'unknown_method' } } : item) }), /unregistered method/);

console.log(`Worker qualification inventory: ${report.kindCount} kinds, ${report.methodCount} methods, ${report.unmeasuredCases.length} benchmark cases without an oracle.`);
