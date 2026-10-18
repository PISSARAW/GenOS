'use strict';

const assert = require('assert');
const svc = require('../src/services/atomicRollbackService');

const plan = svc.buildAtomicRollbackPlan({
  planId: 'rp1',
  missionId: 'm1',
  runId: 'r1',
  checkpointId: 'ck1',
  walHead: 'wh1'
});

assert.strictEqual(plan.schema, 'genos.atomic-rollback/v1');
assert.strictEqual(plan.status, 'prepared');

const withOp = svc.addOperation(plan, {
  id: 'op1',
  type: 'workspace_write',
  target: '/workspace/file.txt',
  reversible: true,
  compensation: { type: 'restore', target: '/workspace/file.txt' }
});
assert.strictEqual(withOp.operations.length, 1);

const withInv = svc.addInvariant(withOp, {
  id: 'inv1',
  description: 'budget not exceeded',
  expression: (ctx) => ctx.budget_ok !== false
});
assert.strictEqual(withInv.invariants.length, 1);

const check = svc.checkInvariants(withInv, { budget_ok: true });
assert.ok(check.allPassed);
assert.strictEqual(check.results[0].passed, true);

const commitResult = svc.commitAtomicRollback(withInv);
assert.ok(commitResult.ok);
assert.strictEqual(commitResult.plan.status, 'committed');
assert.ok(commitResult.receipt.valid);

// Rollback on prepared plan
const plan2 = svc.buildAtomicRollbackPlan({ planId: 'rp2' });
const rollbackResult = svc.rollbackAtomic(plan2);
assert.ok(rollbackResult.ok);
assert.strictEqual(rollbackResult.plan.status, 'rolled_back');

// Cannot rollback committed
try {
  svc.rollbackAtomic(commitResult.plan);
  assert.fail('should have thrown for committed plan');
} catch (err) {
  assert.ok(err.message.includes('cannot be rolled back'));
}

console.log('✓ atomicRollbackService tests passed');
