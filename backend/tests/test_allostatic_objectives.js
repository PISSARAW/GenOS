'use strict';
const assert = require('assert');
const { evaluate, comparePolicies, updateAllostasis } = require('../src/services/allostaticObjectiveService');
assert.strictEqual(evaluate({ pressure: 0.2, objectives: [{ id: 'safety', weight: 2, value: 1, minimum: 0.5 }] }).invariantSatisfied, true);
assert.strictEqual(comparePolicies([{ id: 'a', objectives: [{ id: 'x', weight: 1, value: 1 }] }, { id: 'b', objectives: [{ id: 'x', weight: 1, value: 0.5 }] }])[0].id, 'a');
assert.strictEqual(updateAllostasis({ pressure: 1 }, { error: 5 }).pressure, 2);
console.log('✅ allostatic objective tests passed');
