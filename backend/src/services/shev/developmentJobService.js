'use strict';

const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../db');
const { consumeAuthorization } = require('./authorityService');
const { requireActive, evidenceRefs } = require('./runtimeGuard');
const { requestDevelopment } = require('./developmentRequestService');
const { recordAgentProgress } = require('./agentProgressService');
const { adapter } = require('./actionProvider');
const { performBounded } = require('./boundedAction');

function developmentDetails(input) {
  const budget = input.budget;
  if (!input.organizationId || !input.entityId || !validDevelopmentBudget(budget)) {
    throw new TypeError('SHEV development requires scope and a bounded budget.');
  }
  return { organizationId: input.organizationId, entityId: input.entityId,
    budget: { usd: budget.usd, seconds: budget.seconds, deadlineAt: new Date(budget.deadlineAt).toISOString() } };
}

function validDevelopmentBudget(budget) {
  return budget && Number.isFinite(budget.usd) && budget.usd > 0 && budget.usd <= 100
    && Number.isSafeInteger(budget.seconds) && budget.seconds >= 1 && budget.seconds <= 3600
    && Date.parse(budget.deadlineAt) > Date.now();
}

async function approveDevelopment(db, input) {
  const details = developmentDetails(input);
  return withTransaction(db, async () => {
    const responsibility = await requireActive(db, { projectId: input.projectId, action: true });
    const initiative = await db.get(`SELECT i.*, o.epistemic_status, o.valid_until FROM shev_initiatives i
      JOIN shev_observations o ON o.project_id = i.project_id AND o.id = i.observation_id
      WHERE i.id = ? AND i.project_id = ? AND i.kind = 'learn'`, [input.initiativeId, input.projectId]);
    if (!initiative || initiative.mandate_version !== responsibility.mandateVersion
      || initiative.epistemic_status !== 'observed' || (initiative.valid_until && Date.parse(initiative.valid_until) <= Date.now())) {
      throw new Error('SHEV learning initiative lacks current scoped evidence.');
    }
    await consumeAuthorization(db, { ...input.authorization, operation: 'development-approval',
      projectId: input.projectId, subjectId: input.initiativeId, expectedVersion: responsibility.mandateVersion, details });
    await db.run(`INSERT INTO shev_development_jobs
      (initiative_id, project_id, mandate_version, scope_json, budget_json, authorization_nonce)
      VALUES (?, ?, ?, ?, ?, ?)`, [input.initiativeId, input.projectId, responsibility.mandateVersion,
      JSON.stringify({ organizationId: details.organizationId, projectId: input.projectId, entityId: details.entityId }),
      JSON.stringify(details.budget), input.authorization.nonce]);
    return db.get('SELECT * FROM shev_development_jobs WHERE initiative_id = ?', [input.initiativeId]);
  });
}

async function executeDevelopment(db, input) {
  const perform = input.perform || adapter('performDevelopment');
  const verify = input.verify || adapter('verifyProgress');
  const job = await db.get('SELECT * FROM shev_development_jobs WHERE initiative_id = ? AND project_id = ?', [input.initiativeId, input.projectId]);
  if (job?.status !== 'approved') throw new Error('SHEV development is not approved or requires reconciliation.');
  const budget = JSON.parse(job.budget_json);
  const token = randomUUID();
  await claimDevelopment(db, { job, budget, token });
  try {
    const initiative = await db.get('SELECT observation_id FROM shev_initiatives WHERE id = ?', [job.initiative_id]);
    const scope = JSON.parse(job.scope_json);
    const request = await requestDevelopment(db, { projectId: job.project_id,
      observationId: initiative.observation_id, scope, entityId: scope.entityId });
    const { receipt, elapsedSeconds } = await performBounded({ perform, maxSeconds: budget.seconds,
      deadlineAt: budget.deadlineAt, context: { db, request, scope, budget, idempotencyKey: job.initiative_id },
      guard: () => requireActive(db, { projectId: job.project_id, expectedVersion: job.mandate_version, action: true }) });
    if (!validDevelopmentReceipt(receipt, budget) || elapsedSeconds > budget.seconds) throw new Error('SHEV development receipt lacks costs, transfer or evidence.');
    await requireActive(db, { projectId: job.project_id, expectedVersion: job.mandate_version, action: true });
    const progress = await recordAgentProgress(db, { ...scope, initiativeId: job.initiative_id,
      gvxEventId: receipt.gvxEventId, verify });
    const updated = await db.run(`UPDATE shev_development_jobs SET status = 'completed', receipt_json = ?
      WHERE initiative_id = ? AND status = 'executing' AND execution_token = ?`,
    [JSON.stringify({ receipt, progressId: progress.id, result: progress.result }), job.initiative_id, token]);
    if (updated.changes !== 1) throw new Error('SHEV development fence lost.');
    return { receipt, progress, experimentalCreditIsProjectBenefit: false };
  } catch (error) {
    await db.run(`UPDATE shev_development_jobs SET receipt_json = ? WHERE initiative_id = ? AND execution_token = ?`,
      [JSON.stringify({ error: error.message, reconciliationRequired: true }), job.initiative_id, token]);
    return { status: 'executing', reconciliationRequired: true, error: error.message };
  }
}

function validDevelopmentReceipt(receipt, budget) {
  return receipt && typeof receipt.gvxEventId === 'string' && evidenceRefs(receipt.evidenceRefs)
    && Number.isFinite(receipt.spentUsd) && receipt.spentUsd >= 0 && receipt.spentUsd <= budget.usd
    && Number.isFinite(receipt.seconds) && receipt.seconds >= 0 && receipt.seconds <= budget.seconds;
}

async function claimDevelopment(db, input) {
  return withTransaction(db, async () => {
    await requireActive(db, { projectId: input.job.project_id, expectedVersion: input.job.mandate_version, action: true });
    const auth = await db.get('SELECT payload_json FROM shev_authorizations WHERE nonce = ?', [input.job.authorization_nonce]);
    if (Date.parse(input.budget.deadlineAt) <= Date.now() || Date.parse(JSON.parse(auth.payload_json).expiresAt) <= Date.now()) {
      throw new Error('SHEV development approval expired.');
    }
    const changed = await db.run(`UPDATE shev_development_jobs SET status = 'executing', execution_token = ?
      WHERE initiative_id = ? AND status = 'approved'`, [input.token, input.job.initiative_id]);
    if (changed.changes !== 1) throw new Error('SHEV development was claimed concurrently.');
  });
}

async function reconcileDevelopment(db, input) {
  const job = await db.get('SELECT * FROM shev_development_jobs WHERE initiative_id = ? AND project_id = ?', [input.initiativeId, input.projectId]);
  if (job?.status !== 'executing') throw new Error('SHEV development is not awaiting reconciliation.');
  const receipt = await (input.inspect || adapter('reconcileDevelopment'))({ db, job,
    idempotencyKey: input.initiativeId });
  if (!validDevelopmentReceipt(receipt, JSON.parse(job.budget_json))) throw new Error('SHEV development reconciliation lacks a receipt.');
  return withTransaction(db, async () => {
    const responsibility = await requireActive(db, { projectId: input.projectId, action: true });
    await consumeAuthorization(db, { ...input.authorization, operation: 'development-reconciliation',
      projectId: input.projectId, subjectId: input.initiativeId, expectedVersion: responsibility.mandateVersion,
      details: { gvxEventId: receipt.gvxEventId } });
    const progress = await recordAgentProgress(db, { ...JSON.parse(job.scope_json), initiativeId: input.initiativeId,
      gvxEventId: receipt.gvxEventId, verify: input.verify || adapter('verifyProgress') });
    const updated = await db.run(`UPDATE shev_development_jobs SET status = 'completed', receipt_json = ?, execution_token = NULL
      WHERE initiative_id = ? AND execution_token = ?`, [JSON.stringify({ receipt, progressId: progress.id }), input.initiativeId, job.execution_token]);
    if (updated.changes !== 1) throw new Error('SHEV development fence lost.');
    return { receipt, progress };
  });
}

module.exports = { approveDevelopment, executeDevelopment, reconcileDevelopment, developmentDetails };
