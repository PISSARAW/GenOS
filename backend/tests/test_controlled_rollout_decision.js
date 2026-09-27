'use strict';
const assert = require('assert');
const { planControlledRollout, observeRollout } = require('../src/services/controlledRolloutDecisionService');
const plan = planControlledRollout({ rolloutId: 'r9', policyFlip: true, branches: [{ action: 'a', observedScore: 2, expectedDelta: { x: 1 }, deltas: [{ x: 1 }] }, { action: 'b', observedScore: 1, deltas: [{ x: 2 }] }] });
assert.strictEqual(plan.selected.action, 'a');
assert.strictEqual(plan.composedDelta.x, 1);
assert.strictEqual(observeRollout(plan, { delta: { x: 2 } }).rollbackRequired, true);
console.log('✅ controlled rollout decision tests passed');
