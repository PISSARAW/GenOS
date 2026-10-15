'use strict';

const { randomUUID } = require('node:crypto');
const { migrateHabitatEnforcementReceipts } = require('../db/migrations/migrateHabitatEnforcementReceipts');
const { digest } = require('./biologicalIntegrity');

const trustedPlans = new WeakSet();
const ENFORCER = 'backend:agent-process-supervisor:set-timeout:v1';
const MAX_TIMER_MS = 2147483647;

function enforcementError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function createPlan(revision, binding) {
  const wallClockMs = revision.configuration.limits?.wallClockMs;
  if (wallClockMs === null || wallClockMs === undefined) return null;
  if (revision.configuration.runtimeKind !== 'process') {
    throw enforcementError('HABITAT_LIMIT_UNENFORCED',
      `Limit 'wallClockMs' is not enforced by runtime '${revision.configuration.runtimeKind}'.`);
  }
  if (!Number.isSafeInteger(wallClockMs) || wallClockMs > MAX_TIMER_MS) {
    throw enforcementError('HABITAT_LIMIT_UNENFORCED',
      "Limit 'wallClockMs' cannot be represented by the process timer.");
  }
  const plan = Object.freeze({
    missionId: binding.missionId,
    habitatId: binding.habitatId,
    habitatRevision: binding.habitatRevision,
    habitatHash: binding.habitatHash,
    bindingHash: binding.bindingHash,
    runtimeKind: revision.configuration.runtimeKind,
    guarantee: 'wall_clock_ms',
    limitValue: wallClockMs
  });
  trustedPlans.add(plan);
  return plan;
}

function assertTrustedPlan(plan) {
  if (!plan || !trustedPlans.has(plan)) {
    throw enforcementError('HABITAT_ENFORCEMENT_PLAN_UNTRUSTED',
      'Habitat enforcement must originate from the persisted revision bound by the backend.');
  }
}

function assertRuntimeContext(ctx, habitat, plan) {
  if (!Number.isInteger(ctx.child?.pid) || ctx.child.pid < 1) {
    throw enforcementError('HABITAT_PROCESS_UNAVAILABLE');
  }
  if (!ctx.executionRun?.id || !ctx.agentId) {
    throw enforcementError('HABITAT_EXECUTION_CONTEXT_INCOMPLETE');
  }
  if (habitat?.revision?.contentHash !== plan.habitatHash
      || habitat?.binding?.bindingHash !== plan.bindingHash) {
    throw enforcementError('HABITAT_ENFORCEMENT_CONTEXT_MISMATCH');
  }
}

function receiptRecord(ctx, plan) {
  const issuedAt = new Date().toISOString();
  const deadlineAt = new Date(Date.parse(issuedAt) + plan.limitValue).toISOString();
  const record = { id: randomUUID(), missionId: plan.missionId, agentId: ctx.agentId,
    executionRunId: ctx.executionRun.id, habitatId: plan.habitatId,
    habitatRevision: plan.habitatRevision, habitatHash: plan.habitatHash,
    bindingHash: plan.bindingHash, runtimeKind: plan.runtimeKind, processId: ctx.child.pid,
    guarantee: plan.guarantee, limitValue: plan.limitValue, enforcer: ENFORCER,
    issuedAt, deadlineAt };
  return { ...record, receiptHash: digest(record) };
}

async function persistReceipt(db, receipt) {
  await migrateHabitatEnforcementReceipts(db);
  await db.run(`INSERT INTO habitat_enforcement_receipts
    (id, mission_id, agent_id, execution_run_id, habitat_id, habitat_revision,
      habitat_hash, binding_hash, runtime_kind, process_id, guarantee, limit_value,
      enforcer, issued_at, deadline_at, receipt_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  receipt.id, receipt.missionId, receipt.agentId, receipt.executionRunId,
  receipt.habitatId, receipt.habitatRevision, receipt.habitatHash, receipt.bindingHash,
  receipt.runtimeKind, receipt.processId, receipt.guarantee, receipt.limitValue,
  receipt.enforcer, receipt.issuedAt, receipt.deadlineAt, receipt.receiptHash);
}

function armTimer(ctx, plan) {
  const timer = setTimeout(() => {
    ctx.haltRuntime(ctx, 'habitat_wall_clock', 'habitat_wall_clock_exceeded',
      'Runtime stopped after reaching the wall-clock limit of its bound habitat.',
      { habitatId: plan.habitatId, habitatRevision: plan.habitatRevision,
        habitatHash: plan.habitatHash, wallClockMs: plan.limitValue });
  }, plan.limitValue);
  if (typeof timer.unref === 'function') timer.unref();
  ctx.child.once('close', () => clearTimeout(timer));
  return timer;
}

async function armProcessWallClock(ctx, habitat = ctx.habitat) {
  const plan = habitat?.enforcementPlan;
  if (!plan) return null;
  assertTrustedPlan(plan);
  assertRuntimeContext(ctx, habitat, plan);
  const receipt = receiptRecord(ctx, plan);
  const timer = armTimer(ctx, plan);
  try {
    await persistReceipt(ctx.db, receipt);
  } catch (error) {
    clearTimeout(timer);
    ctx.haltRuntime(ctx, 'habitat_enforcement_failed', 'habitat_enforcement_receipt_failed',
      'Runtime stopped because its habitat enforcement receipt could not be persisted.',
      { habitatHash: plan.habitatHash, error: error.message });
    throw enforcementError('HABITAT_ENFORCEMENT_RECEIPT_FAILED', error.message);
  }
  ctx.habitatEnforcementTimer = timer;
  ctx.habitatEnforcementReceipt = Object.freeze(receipt);
  return ctx.habitatEnforcementReceipt;
}

function assertSupervisedProcess(ctx, inProcess) {
  if (ctx.habitat?.enforcementPlan && inProcess) {
    throw enforcementError('HABITAT_PROCESS_UNSUPERVISED',
      'The bound wall-clock guarantee requires a supervised child process.');
  }
}

module.exports = { createPlan, armProcessWallClock, assertSupervisedProcess,
  enforcementError, ENFORCER };
