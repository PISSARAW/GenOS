'use strict';
const assert = require('assert');
const { promoteHypothesis, buildPlan, executePlan } = require('../src/services/hypothesisActionPlannerService');
const promoted = promoteHypothesis({ id: 'h1' }, ['receipt:1']);
const plan = buildPlan(promoted, { type: 'change', semanticDelta: { score: 1 } });
assert.strictEqual(executePlan(plan, { delta: { score: 1 } }).rollback, false);
assert.strictEqual(executePlan(plan, { delta: { score: 0 } }).rollback, true);
console.log('✅ hypothesis action planner tests passed');
