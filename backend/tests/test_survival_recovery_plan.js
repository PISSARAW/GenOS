const assert = require('node:assert/strict');
const { recoveryPlan } = require('../src/services/survivalStateService');

const plan = recoveryPlan(['infection', 'injury', 'stagnation']);
assert.deepEqual(plan.map((item) => item.action), [
  'quarantine', 'require_independent_evidence', 'isolate_restore_validate', 'controlled_mutation'
]);
assert(plan.every((item) => item.status === 'requested'));
assert(plan.every((item) => item.requiresReceipt === true));
assert.equal(recoveryPlan(['unknown']).length, 0);
console.log('Survival recovery plans are typed, explicit and receipt-gated.');
