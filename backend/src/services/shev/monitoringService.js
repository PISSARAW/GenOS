'use strict';

const { createHash } = require('node:crypto');
const { getResponsibility } = require('./responsibilityService');
const { consumeAuthorization } = require('./authorityService');

function monitoringId(initiativeId, observationId) {
  return `shev_monitor_${createHash('sha256').update(`${initiativeId}\0${observationId}`).digest('hex')}`;
}

function validAssessment(value) {
  return value && ['confirmed', 'regressed', 'inconclusive'].includes(value.result)
    && typeof value.verifierRef === 'string' && value.verifierRef.trim()
    && Array.isArray(value.evidenceRefs) && value.evidenceRefs.length > 0;
}

async function dueWatches(db, nowMs = Date.now()) {
  return db.all(`SELECT * FROM shev_watches WHERE status = 'active' AND next_due_at <= ?
    ORDER BY next_due_at, initiative_id`, [new Date(nowMs).toISOString()]);
}

async function monitoringContext(db, input) {
  const effect = await db.get(`SELECT e.*, i.project_id, i.observation_id
    FROM shev_effects e JOIN shev_initiatives i ON i.id = e.initiative_id
    WHERE e.initiative_id = ? AND i.project_id = ?`, [input.initiativeId, input.projectId]);
  const after = await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, input.observationId]);
  const baseline = effect && await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, effect.post_observation_id]);
  if (!effect || !after || after.dimension !== baseline.dimension
    || !['state', 'degradation'].includes(after.kind) || after.epistemic_status !== 'observed'
    || Date.parse(after.observed_at) <= Date.parse(baseline.observed_at)
    || (after.valid_until && Date.parse(after.valid_until) <= Date.now())) {
    throw new Error('SHEV monitoring observation is missing or incomparable.');
  }
  return { effect, baseline, after };
}

async function monitorProjectEffect(db, input) {
  if (typeof input?.verify !== 'function') throw new TypeError('SHEV monitoring requires a verifier.');
  const id = monitoringId(input.initiativeId, input.observationId);
  const existing = await db.get('SELECT * FROM shev_monitoring WHERE id = ?', [id]);
  if (existing) return { ...existing, replayed: true };
  const context = await monitoringContext(db, input);
  const assessment = await input.verify(context);
  if (!validAssessment(assessment)) throw new Error('SHEV monitoring verifier lacks evidence.');
  await db.exec('BEGIN IMMEDIATE');
  try {
    const inserted = await db.run(`INSERT OR IGNORE INTO shev_monitoring
      (id, initiative_id, observation_id, result, verifier_ref, evidence_json)
      VALUES (?, ?, ?, ?, ?, ?)`, [id, input.initiativeId, input.observationId,
      assessment.result, assessment.verifierRef, JSON.stringify(assessment.evidenceRefs)]);
    if (inserted.changes === 1) await updateWatch(db, input.initiativeId, assessment.result);
    const stored = await db.get('SELECT * FROM shev_monitoring WHERE id = ?', [id]);
    await db.exec('COMMIT');
    return { ...stored, replayed: inserted.changes === 0 };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function updateWatch(db, initiativeId, result) {
  const watch = await db.get('SELECT interval_ms FROM shev_watches WHERE initiative_id = ?', [initiativeId]);
  if (!watch) throw new Error('SHEV monitoring watch is absent.');
  await db.run(`UPDATE shev_watches SET status = ?, next_due_at = ? WHERE initiative_id = ?`,
  [result === 'regressed' ? 'alert' : 'active',
    new Date(Date.now() + watch.interval_ms).toISOString(), initiativeId]);
}

function validPlanBudget(plan) {
  return Number.isFinite(plan.budgetUsd) && plan.budgetUsd > 0 && plan.budgetUsd <= 100
    && Number.isSafeInteger(plan.maxSeconds) && plan.maxSeconds > 0 && plan.maxSeconds <= 3600
    && Number.isFinite(Date.parse(plan.deadlineAt)) && Date.parse(plan.deadlineAt) > Date.now();
}

function validatedPlan(plan) {
  if (!plan || typeof plan.actionRef !== 'string' || !plan.actionRef.trim()
    || !validPlanBudget(plan) || !['on-failed-check', 'on-regression'].includes(plan.stopCondition)
    || typeof plan.alternative !== 'string' || !plan.alternative.trim()) {
    throw new TypeError('SHEV recovery needs action, budget, stop and alternative.');
  }
  return { actionRef: plan.actionRef, budgetUsd: plan.budgetUsd,
    maxSeconds: plan.maxSeconds, deadlineAt: new Date(plan.deadlineAt).toISOString(),
    stopCondition: plan.stopCondition, alternative: plan.alternative };
}

function withinRecoveryBudget(receipt, plan) {
  return Number.isFinite(receipt.spentUsd) && receipt.spentUsd >= 0
    && receipt.spentUsd <= plan.budgetUsd && Number.isFinite(receipt.seconds)
    && receipt.seconds >= 0 && receipt.seconds <= plan.maxSeconds;
}

function validRecoveryReceipt(receipt, plan) {
  return receipt?.result === 'applied' && Array.isArray(receipt.evidenceRefs)
    && receipt.evidenceRefs.length > 0 && typeof receipt.externalReceiptRef === 'string'
    && receipt.externalReceiptRef.trim() && withinRecoveryBudget(receipt, plan);
}

async function proposeRecovery(db, input) {
  const monitored = await db.get(`SELECT m.*, i.project_id FROM shev_monitoring m
    JOIN shev_initiatives i ON i.id = m.initiative_id WHERE m.id = ?`, [input.monitoringId]);
  if (!monitored || monitored.project_id !== input.projectId || monitored.result !== 'regressed') {
    throw new Error('SHEV recovery requires a confirmed monitored regression.');
  }
  const plan = validatedPlan(input.plan);
  await db.run(`INSERT OR IGNORE INTO shev_recoveries (monitoring_id, status, plan_json)
    VALUES (?, 'proposed', ?)`, [input.monitoringId, JSON.stringify(plan)]);
  const row = await db.get('SELECT * FROM shev_recoveries WHERE monitoring_id = ?', [input.monitoringId]);
  if (row.plan_json !== JSON.stringify(plan)) throw new Error('SHEV recovery plan idempotency conflict.');
  return row;
}

async function approveRecovery(db, input) {
  const responsibility = await getResponsibility(db, input?.projectId);
  const row = await db.get(`SELECT r.*, i.project_id FROM shev_recoveries r
    JOIN shev_monitoring m ON m.id = r.monitoring_id
    JOIN shev_initiatives i ON i.id = m.initiative_id WHERE r.monitoring_id = ?`, [input.monitoringId]);
  if (!responsibility || row?.project_id !== input.projectId || row.status !== 'proposed') {
    throw new Error('SHEV recovery is not approvable.');
  }
  const authorization = { ...input.authorization, operation: 'recovery-approval',
    projectId: input.projectId, subjectId: input.monitoringId,
    expectedVersion: responsibility.mandateVersion, details: JSON.parse(row.plan_json) };
  await db.exec('BEGIN IMMEDIATE');
  try {
    await consumeAuthorization(db, authorization);
    const current = await db.get('SELECT mandate_version FROM shev_responsibilities WHERE project_id = ?', [input.projectId]);
    if (current.mandate_version !== responsibility.mandateVersion) throw new Error('SHEV mandate changed during recovery approval.');
    await db.run(`UPDATE shev_recoveries SET status = 'approved', authorization_nonce = ?
      WHERE monitoring_id = ? AND status = 'proposed'`, [authorization.nonce, input.monitoringId]);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  return db.get('SELECT * FROM shev_recoveries WHERE monitoring_id = ?', [input.monitoringId]);
}

async function executeRecovery(db, input) {
  if (typeof input?.perform !== 'function') throw new TypeError('SHEV recovery adapter is required.');
  const row = await db.get('SELECT * FROM shev_recoveries WHERE monitoring_id = ?', [input.monitoringId]);
  if (row?.status !== 'approved' || !row.authorization_nonce) throw new Error('SHEV recovery is not approved.');
  const plan = JSON.parse(row.plan_json);
  if (Date.parse(plan.deadlineAt) <= Date.now()) throw new Error('SHEV recovery approval expired.');
  const claimed = await db.run(`UPDATE shev_recoveries SET status = 'executing'
    WHERE monitoring_id = ? AND status = 'approved'`, [input.monitoringId]);
  if (claimed.changes !== 1) throw new Error('SHEV recovery was claimed concurrently.');
  let receipt;
  try { receipt = await input.perform({ plan, monitoringId: input.monitoringId }); } catch (error) {
    receipt = { result: 'halted', error: error.message, evidenceRefs: [] };
  }
  const valid = validRecoveryReceipt(receipt, plan);
  const status = valid ? 'applied' : 'halted';
  await db.run(`UPDATE shev_recoveries SET status = ?, receipt_json = ? WHERE monitoring_id = ?
    AND status = 'executing'`, [status, JSON.stringify(receipt), input.monitoringId]);
  if (valid) await db.run(`UPDATE shev_watches SET status = 'active' WHERE initiative_id =
    (SELECT initiative_id FROM shev_monitoring WHERE id = ?)`, [input.monitoringId]);
  return { status, receipt };
}

module.exports = { dueWatches, monitorProjectEffect, proposeRecovery, approveRecovery, executeRecovery };
