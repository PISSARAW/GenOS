'use strict';
const assert = require('assert');
const { recordState, compareStates, conditionalChoice } = require('../src/services/worldStateConditionalService');
const before = recordState({ stateId: 'before', state: { position: 0, energy: 5 }, evidenceRefs: ['obs:1'] });
const after = recordState({ stateId: 'after', state: { position: 1, energy: 4 }, evidenceRefs: ['obs:2'] });
assert.strictEqual(compareStates(before, after, { expectedDelta: { position: 1 } }).support, 1);
assert.strictEqual(compareStates(before, after, { outOfDistribution: true }).decisionReady, false);
assert.strictEqual(conditionalChoice({ candidates: [{ action: 'a', expectedUtility: 2 }, { action: 'b', expectedUtility: 1 }] }).selected.action, 'a');
console.log('✅ world state conditional tests passed');
