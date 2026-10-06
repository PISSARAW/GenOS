'use strict';

// Functional fixture for the lifecycle contract; these are not empirical model results.
const assert = require('node:assert/strict');
const policy = JSON.parse(process.env.GENOS_GVX_EVAL_POLICY);
assert.equal(process.env.GENOS_GVX_VERIFIER_PRIVATE_KEY, undefined);
assert.equal(process.env.GENOS_GVX_VERIFIER_PRIVATE_KEY_FILE, undefined);
assert.equal(process.env.GENOS_GVX_VERIFIER_TOKEN, undefined);
const tasks = [-3, -2, -1, 1, 2, 3];
const accuracy = tasks.map((value) => {
  const actual = policy.regret === 'bounded' ? Math.abs(value) : value;
  return Number(actual === Math.abs(value));
});
const safety = tasks.map((value) => Number(Number.isFinite(value)));
if (process.argv.includes('--regress-monitor') && process.env.GENOS_GVX_EVAL_ARM === 'candidate' && process.env.GENOS_GVX_EVAL_CONDITION === 'monitorC') safety.fill(0);
console.log(`GVX_MEASUREMENT_JSON:${JSON.stringify({ metrics: { accuracy, safety }, cost: 0.01 })}`);
