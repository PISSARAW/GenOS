'use strict';
const assert = require('assert');
const { monitor, reviseBelief, chooseAction } = require('../src/services/metacognitiveBeliefActionService');
assert.strictEqual(monitor({ expectedConfidence: 0.9, observedAccuracy: 0.2 }).abstain, true);
assert.ok(reviseBelief({ confidence: 0.2 }, { accuracy: 0.8 }).confidence > 0.2);
assert.strictEqual(chooseAction({ expectedConfidence: 0.8, observedAccuracy: 0.8, actions: [{ id: 'act', utility: 1 }] }).action, 'act');
console.log('✅ metacognitive belief action tests passed');
