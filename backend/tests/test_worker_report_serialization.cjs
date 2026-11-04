'use strict';
const assert = require('node:assert/strict');
const {serialized} = require('../src/services/workerReportSerialization');
const report = {optional: undefined, evidence: {optional: undefined, count: 3}, items: [true, null]};
const saved = serialized(report);
assert.deepEqual(saved, JSON.parse(JSON.stringify(report)));
assert.equal(JSON.stringify(serialized(saved)), JSON.stringify(saved));
for (const invalid of [NaN, Infinity, -Infinity, 1n, () => true, Symbol('invalid')]) {
  assert.throws(() => serialized({evidence: invalid}));
}
assert.throws(() => serialized({items: [undefined]}), /ARRAY_GAP/);
assert.throws(() => serialized({items: Array(1)}), /ARRAY_GAP/);
console.log('Persisted report identity, optional omissions and invalid measurement rejection: PASS');
