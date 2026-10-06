'use strict';

const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../db');
const { consumeAuthorization } = require('./authorityService');
const { getResponsibility } = require('./responsibilityService');
const { requireActive, evidenceRefs } = require('./runtimeGuard');

function text(value) { return typeof value === 'string' && value.trim() && value.length <= 1024; }

function validBudget(plan) {
  return Number.isFinite(plan.budgetUsd) && plan.budgetUsd > 0 && plan.budgetUsd <= 100
    && Number.isSafeInteger(plan.maxSeconds) && plan.maxSeconds > 0 && plan.maxSeconds <= 3600
    && Number.isFinite(Date.parse(plan.deadlineAt)) && Date.parse(plan.deadlineAt) > Date.now();
}

function validatedPlan(plan) {
  if (!plan || !text(plan.actionRef) || !text(plan.alternative) || !validBudget(plan)
    || !['on-failed-check', 'on-regression'].includes(plan.stopCondition)) {
    throw new TypeError('SHEV recovery needs action, budget, stop and alternative.');
  }
  const result = { actionRef: plan.actionRef, budgetUsd: plan.budgetUsd,
    maxSeconds: plan.maxSeconds, deadlineAt: new Date(plan.deadlineAt).toISOString(),
    stopCondition: plan.stopCondition, alternative: plan.alternative };
  if (plan.maxAttempts !== undefined) {
    if (!Number.isSafeInteger(plan.maxAttempts) || plan.maxAttempts < 1 || plan.maxAttempts > 3) throw new Error('SHEV recovery attempts must be bounded.');
    result.maxAttempts = plan.maxAttempts;
  }
  return result;
}

function validReceipt(receipt, plan) {
  return receipt?.result === 'applied' && evidenceRefs(receipt.evidenceRefs) && text(receipt.externalReceiptRef)
    && Number.isFinite(receipt.spentUsd) && receipt.spentUsd >= 0 && receipt.spentUsd <= plan.budgetUsd
    && Number.isFinite(receipt.seconds) && receipt.seconds >= 0 && receipt.seconds <= plan.maxSeconds;
}

async function recoveryContext(db, monitoringId) {
  return db.get(`SELECT r.*, i.project_id, a.payload_json FROM shev_recoveries r
    JOIN shev_monitoring m ON m.id = r.monitoring_id JOIN shev_initiatives i ON i.id = m.initiative_id
    LEFT JOIN shev_authorizations a ON a.nonce = r.authorization_nonce WHERE r.monitoring_id = ?`, [monitoringId]);
}

async function proposeRecovery(db, input) {
  const monitored = await db.get(`SELECT m.*, i.project_id FROM shev_monitoring m
    JOIN shev_initiatives i ON i.id = m.initiative_id WHERE m.id = ?`, [input.monitoringId]);
  if (!monitored || monitored.project_id !== input.projectId || monitored.result !== 'regressed') throw new Error('SHEV recovery requires a confirmed monitored regression.');
  const plan = validatedPlan(input.plan);
  await db.run(`INSERT OR IGNORE INTO shev_recoveries (monitoring_id, status, plan_json)
    VALUES (?, 'proposed', ?)`, [input.monitoringId, JSON.stringify(plan)]);
  const row = await recoveryContext(db, input.monitoringId);
  if (row.plan_json !== JSON.stringify(plan)) throw new Error('SHEV recovery plan idempotency conflict.');
  return row;
}

function canApprove(row) {
  return row?.status === 'proposed' || (row?.status === 'halted' && JSON.parse(row.receipt_json || '{}').result === 'not-applied');
}

async function approveRecovery(db, input) {
  return withTransaction(db, async () => {
    const responsibility = await requireActive(db, { projectId: input.projectId, action: true });
    const row = await recoveryContext(db, input.monitoringId);
    if (!canApprove(row) || row.project_id !== input.projectId) throw new Error('SHEV recovery is not approvable.');
    const plan = validatedPlan(JSON.parse(row.plan_json));
    if (row.attempts >= (plan.maxAttempts || 1)) throw new Error('SHEV recovery attempts exhausted.');
    await consumeAuthorization(db, { ...input.authorization, operation: 'recovery-approval',
      projectId: input.projectId, subjectId: input.monitoringId, expectedVersion: responsibility.mandateVersion, details: plan });
    await db.run(`UPDATE shev_recoveries SET status = 'approved', authorization_nonce = ? WHERE monitoring_id = ?`, [input.authorization.nonce, input.monitoringId]);
    return recoveryContext(db, input.monitoringId);
  });
}

async function claimRecovery(db, input) {
  return withTransaction(db, async () => {
    const row = await recoveryContext(db, input.monitoringId);
    if (row?.status !== 'approved' || !row.payload_json) throw new Error('SHEV recovery is not approved.');
    if (input.projectId && input.projectId !== row.project_id) throw new Error('SHEV recovery project mismatch.');
    const authorization = JSON.parse(row.payload_json);
    await requireActive(db, { projectId: row.project_id, expectedVersion: authorization.expectedVersion, action: true });
    const plan = validatedPlan(JSON.parse(row.plan_json));
    if (Date.parse(authorization.expiresAt) <= Date.now() || row.attempts >= (plan.maxAttempts || 1)) throw new Error('SHEV recovery approval expired or attempts exhausted.');
    const token = randomUUID();
    const claimed = await db.run(`UPDATE shev_recoveries SET status = 'executing', execution_token = ?,
      attempts = attempts + 1 WHERE monitoring_id = ? AND status = 'approved'`, [token, input.monitoringId]);
    if (claimed.changes !== 1) throw new Error('SHEV recovery was claimed concurrently.');
    return { row, plan, token, authorization };
  });
}

async function performBounded(db, input, claim) {
  return require('./boundedAction').performBounded({ perform: input.perform,
    maxSeconds: claim.plan.maxSeconds, deadlineAt: claim.plan.deadlineAt,
    context: { plan: claim.plan, monitoringId: input.monitoringId, idempotencyKey: input.monitoringId },
    guard: () => requireActive(db, { projectId: claim.row.project_id,
      expectedVersion: claim.authorization.expectedVersion, action: true }) });
}

async function finishRecovery(db, result, claim) {
  const valid = validReceipt(result.receipt, claim.plan) && result.elapsedSeconds <= claim.plan.maxSeconds;
  if (!valid) throw new Error('SHEV recovery receipt is invalid; reconciliation required.');
  return withTransaction(db, async () => {
    await requireActive(db, { projectId: claim.row.project_id, expectedVersion: claim.authorization.expectedVersion, action: true });
    const status = 'applied';
    const updated = await db.run(`UPDATE shev_recoveries SET status = ?, receipt_json = ?
      WHERE monitoring_id = ? AND status = 'executing' AND execution_token = ?`,
    [status, JSON.stringify(result.receipt), claim.row.monitoring_id, claim.token]);
    if (updated.changes !== 1) throw new Error('SHEV recovery execution fence was lost.');
    await resumeWatch(db, claim.row.monitoring_id);
    return { status, receipt: result.receipt };
  });
}

async function resumeWatch(db, monitoringId) {
  await db.run(`UPDATE shev_watches SET status = 'active', next_due_at = ? WHERE initiative_id =
    (SELECT initiative_id FROM shev_monitoring WHERE id = ?)`, [new Date().toISOString(), monitoringId]);
}

async function executeRecovery(db, input) {
  if (typeof input?.perform !== 'function') throw new TypeError('SHEV recovery adapter is required.');
  const claim = await claimRecovery(db, input);
  try { return await finishRecovery(db, await performBounded(db, input, claim), claim); }
  catch (error) {
    await db.run(`UPDATE shev_recoveries SET receipt_json = ? WHERE monitoring_id = ?
      AND status = 'executing' AND execution_token = ?`, [JSON.stringify({ result: 'unknown', error: error.message }), input.monitoringId, claim.token]);
    return { status: 'executing', reconciliationRequired: true, error: error.message };
  }
}

async function reconcileRecovery(db, input) {
  const row = await recoveryContext(db, input.monitoringId);
  if (row?.project_id !== input.projectId || row.status !== 'executing' || typeof input.verify !== 'function') throw new Error('SHEV recovery reconciliation requires an executing operation and external verification.');
  const plan = JSON.parse(row.plan_json);
  const receipt = input.receipt;
  validateReconciliationReceipt(receipt, plan);
  const verification = await input.verify({ receipt, plan, idempotencyKey: input.monitoringId });
  requireVerification(verification);
  return withTransaction(db, async () => {
    const current = await getResponsibility(db, input.projectId);
    await consumeAuthorization(db, { ...input.authorization, operation: 'recovery-reconciliation',
      projectId: input.projectId, subjectId: input.monitoringId, expectedVersion: current.mandateVersion, details: receipt });
    const updated = await db.run(`UPDATE shev_recoveries SET status = ?, receipt_json = ?, execution_token = NULL
      WHERE monitoring_id = ? AND status = 'executing' AND execution_token = ?`,
    [receipt.result === 'applied' ? 'applied' : 'halted', JSON.stringify({ ...receipt, verification }), input.monitoringId, row.execution_token]);
    if (updated.changes !== 1) throw new Error('SHEV recovery changed during reconciliation.');
    if (receipt.result === 'applied') await resumeWatch(db, input.monitoringId);
    return recoveryContext(db, input.monitoringId);
  });
}

function validateReconciliationReceipt(receipt, plan) {
  const valid = validReceipt(receipt, plan) || (receipt?.result === 'not-applied' && evidenceRefs(receipt.evidenceRefs));
  if (!valid) throw new Error('SHEV recovery reconciliation lacks an external receipt.');
}

function requireVerification(verification) {
  if (verification?.verified !== true || !text(verification.verifierRef) || !evidenceRefs(verification.evidenceRefs)) {
    throw new Error('SHEV recovery reconciliation was not verified.');
  }
}

module.exports = { proposeRecovery, approveRecovery, executeRecovery, reconcileRecovery };
