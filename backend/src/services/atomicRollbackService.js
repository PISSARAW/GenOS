'use strict';

const SCHEMA = 'genos.atomic-rollback/v1';
const STATUSES = Object.freeze(['prepared', 'committed', 'rolled_back', 'failed']);

function buildAtomicRollbackPlan(input = {}) {
  const plan = {
    schema: SCHEMA,
    plan_id: input.planId || null,
    mission_id: input.missionId || null,
    run_id: input.runId || null,
    checkpoint_id: input.checkpointId || null,
    wal_head: input.walHead || null,
    operations: input.operations || [],
    invariants: input.invariants || [],
    status: 'prepared',
    version: 1,
    committed_at: null,
    rolled_back_at: null,
    receipt: null
  };
  return validateAtomicRollbackPlan(plan);
}

function validateAtomicRollbackPlan(plan) {
  if (!plan || plan.schema !== SCHEMA) {
    throw new Error(`atomic_rollback.schema must be ${SCHEMA}`);
  }
  if (!STATUSES.includes(plan.status)) {
    throw new Error(`atomic_rollback.status must be one of ${JSON.stringify(STATUSES)}`);
  }
  if (!Array.isArray(plan.operations)) {
    throw new Error('atomic_rollback.operations must be an array');
  }
  if (!Array.isArray(plan.invariants)) {
    throw new Error('atomic_rollback.invariants must be an array');
  }
  return plan;
}

function addOperation(plan, operation = {}) {
  const op = {
    id: operation.id || null,
    type: operation.type || 'unknown',
    target: operation.target || null,
    before_state: operation.beforeState || null,
    after_state: operation.afterState || null,
    reversible: operation.reversible !== false,
    compensation: operation.compensation || null,
    executed: false
  };
  if (!op.type) {
    throw new Error('atomic_rollback operation must have a type');
  }
  const next = { ...plan };
  next.operations = [...plan.operations, op];
  return validateAtomicRollbackPlan(next);
}

function addInvariant(plan, invariant = {}) {
  const inv = {
    id: invariant.id || null,
    description: invariant.description || '',
    expression: invariant.expression || null,
    checked: false,
    passed: null
  };
  const next = { ...plan };
  next.invariants = [...plan.invariants, inv];
  return validateAtomicRollbackPlan(next);
}

function checkInvariants(plan, context = {}) {
  const results = [];
  for (const invariant of plan.invariants) {
    let passed = null;
    if (typeof invariant.expression === 'function') {
      try {
        passed = invariant.expression(context);
      } catch (err) {
        passed = false;
      }
    }
    results.push({ ...invariant, checked: true, passed });
  }
  const allPassed = results.every((r) => r.passed === true);
  return { allPassed, results };
}

function commitAtomicRollback(plan, committedAt = null) {
  if (plan.status !== 'prepared') {
    throw new Error('only prepared atomic rollback plans can be committed');
  }
  const invariantCheck = checkInvariants(plan);
  if (!invariantCheck.allPassed) {
    return { ok: false, reason: 'invariants_not_satisfied', results: invariantCheck.results };
  }
  return {
    ok: true,
    plan: { ...plan, status: 'committed', committed_at: committedAt || new Date().toISOString() },
    receipt: buildReceipt(plan)
  };
}

function rollbackAtomic(plan, rolledBackAt = null) {
  if (plan.status === 'rolled_back') {
    throw new Error('atomic rollback plan already rolled back');
  }
  if (plan.status === 'committed') {
    throw new Error('committed atomic rollback plans cannot be rolled back');
  }
  const compensationOps = plan.operations
    .filter((op) => op.reversible && op.compensation)
    .reverse();
  return {
    ok: true,
    plan: { ...plan, status: 'rolled_back', rolled_back_at: rolledBackAt || new Date().toISOString() },
    compensation_operations: compensationOps
  };
}

function failAtomicRollback(plan, reason) {
  return { ...plan, status: 'failed', failure_reason: reason };
}

function buildReceipt(plan) {
  return {
    schema: 'genos.atomic-rollback-receipt/v1',
    plan_id: plan.plan_id,
    mission_id: plan.mission_id,
    run_id: plan.run_id,
    checkpoint_id: plan.checkpoint_id,
    wal_head: plan.wal_head,
    status: plan.status,
    operation_count: plan.operations.length,
    invariant_count: plan.invariants.length,
    valid: true
  };
}

module.exports = {
  SCHEMA,
  STATUSES,
  buildAtomicRollbackPlan,
  validateAtomicRollbackPlan,
  addOperation,
  addInvariant,
  checkInvariants,
  commitAtomicRollback,
  rollbackAtomic,
  failAtomicRollback,
  buildReceipt
};
