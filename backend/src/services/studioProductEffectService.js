'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const store = require('./studioProductionStore');
const contracts = require('./studioProductContractService');
const evaluation = require('./studioProductEvaluationService');

const hash = value => crypto.createHash('sha256').update(contracts.canonical(value)).digest('hex');

async function subject(db, context) {
  const release = await store.release(db, context);
  const contract = await contracts.byId(db, { ...context, workflowId: release.row.workflow_id,
    contractId: input.text(context.contractId || context.body.contractId, 200) });
  await evaluation.requireAcceptance(db, { ...context, contractId: contract.contractId });
  return { release, contract };
}

async function productionRun(db, target, runId) {
  const run = await db.get(`SELECT r.*, i.environment, i.release_hash FROM workflow_runs r
    JOIN studio_deployment_invocations i ON i.run_id=r.id
    WHERE r.id=? AND i.release_id=? AND r.workflow_id=? AND r.organization_id=? AND r.project_id=?`,
  runId, target.release.row.id, target.release.row.workflow_id,
  target.release.row.organization_id, target.release.row.project_id);
  const valid = run?.environment === 'production' && run.status === 'completed'
    && !run.error_json && run.release_hash === target.release.row.payload_hash;
  if (!valid) throw failure('PRODUCT_PRODUCTION_EFFECT_REQUIRED', 409);
  return run;
}

function metric(value) {
  const object = input.object(value);
  const numbers = ['baseline', 'observed', 'minimumEffect', 'sampleSize'];
  if (numbers.some(key => typeof object[key] !== 'number' || !Number.isFinite(object[key]))) {
    throw failure('PRODUCT_EFFECT_METRIC_INVALID', 400);
  }
  if (object.minimumEffect < 0 || !Number.isInteger(object.sampleSize) || object.sampleSize < 1) {
    throw failure('PRODUCT_EFFECT_METRIC_INVALID', 400);
  }
  const direction = input.text(object.direction, 20);
  if (!['increase', 'decrease'].includes(direction)) throw failure('PRODUCT_EFFECT_DIRECTION_INVALID', 400);
  return { name: input.text(object.name, 100), unit: input.text(object.unit, 50),
    baseline: object.baseline, observed: object.observed, minimumEffect: object.minimumEffect,
    sampleSize: object.sampleSize, direction };
}

function verdict(measure) {
  const improvement = measure.direction === 'increase'
    ? measure.observed - measure.baseline : measure.baseline - measure.observed;
  if (improvement >= measure.minimumEffect) return 'supported';
  if (improvement < 0) return 'refuted';
  return 'inconclusive';
}

function references(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw failure('PRODUCT_EFFECT_EVIDENCE_REQUIRED', 400);
  }
  return [...new Set(value.map(item => input.text(item, 500)))];
}

async function observe(db, context) {
  const target = await subject(db, context);
  if (target.release.row.created_by === context.actor) throw failure('PRODUCT_EFFECT_OBSERVER_NOT_INDEPENDENT', 409);
  const hypothesisId = input.text(context.body.hypothesisId, 100);
  if (!target.contract.userHypotheses.some(item => item.id === hypothesisId)) {
    throw failure('PRODUCT_HYPOTHESIS_NOT_FOUND', 404);
  }
  const runId = input.text(context.body.runId, 200);
  await productionRun(db, target, runId);
  const contextKind = input.text(context.body.contextKind, 30);
  if (!['production', 'holdout'].includes(contextKind)) throw failure('PRODUCT_EFFECT_CONTEXT_INVALID', 400);
  const measure = metric(context.body.metric);
  const evidenceRefs = references(context.body.evidenceRefs);
  const payload = { releaseId: target.release.row.id, contractId: target.contract.contractId,
    observer: context.actor, hypothesisId, runId, contextKind, metric: measure,
    verdict: verdict(measure), evidenceRefs };
  const observationHash = hash(payload);
  const id = `product-effect-${observationHash.slice(0, 24)}`;
  await db.run(`INSERT INTO studio_product_effects
    (id,release_id,contract_id,observer,hypothesis_id,verdict,run_id,context_kind,
     metric_json,evidence_refs_json,observation_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  id, payload.releaseId, payload.contractId, payload.observer, hypothesisId, payload.verdict,
  runId, contextKind, JSON.stringify(measure), JSON.stringify(evidenceRefs), observationHash);
  return { effectId: id, observationHash, ...payload, effectObserved: true,
    acceptanceGranted: true, deploymentTriggered: false };
}

async function observations(db, target) {
  const rows = await db.all(`SELECT * FROM studio_product_effects
    WHERE release_id=? AND contract_id=? ORDER BY rowid`, target.release.row.id,
  target.contract.contractId);
  for (const row of rows) {
    const material = { releaseId: row.release_id, contractId: row.contract_id,
      observer: row.observer, hypothesisId: row.hypothesis_id, runId: row.run_id,
      contextKind: row.context_kind, metric: JSON.parse(row.metric_json), verdict: row.verdict,
      evidenceRefs: JSON.parse(row.evidence_refs_json) };
    if (hash(material) !== row.observation_hash) throw failure('PRODUCT_EFFECT_INTEGRITY_FAILED', 409);
  }
  return rows;
}

function actionFor(rows) {
  if (rows.some(row => row.verdict === 'refuted')) return 'ROLLBACK_RECOMMENDED';
  const independent = new Set(rows.map(row => row.observer)).size >= 2;
  const runs = new Set(rows.map(row => row.run_id)).size >= 2;
  const holdout = rows.some(row => row.context_kind === 'holdout');
  if (rows.length >= 2 && independent && runs && holdout
    && rows.every(row => row.verdict === 'supported')) return 'PROPOSE_TRANSFER_EXPERIMENT';
  return 'NO_CHANGE';
}

function initiativePayload(target, rows, action) {
  const observationRefs = rows.map(row => row.observation_hash).sort();
  return { releaseId: target.release.row.id, contractId: target.contract.contractId,
    action, observationRefs, reason: action === 'NO_CHANGE' ? 'evidence_insufficient_or_inconclusive'
      : action === 'ROLLBACK_RECOMMENDED' ? 'real_world_regression_observed'
        : 'independent_production_and_holdout_effects_supported',
    learning: { transferable: action === 'PROPOSE_TRANSFER_EXPERIMENT',
      requiresTargetExperiment: true, sourceVerified: action === 'PROPOSE_TRANSFER_EXPERIMENT' },
    boundaries: { deploymentTriggered: false, rollbackTriggered: false,
      humanApprovalRequired: action !== 'NO_CHANGE' } };
}

async function persistInitiative(db, target, payload) {
  const causeHash = hash(payload);
  const prior = await db.get('SELECT * FROM studio_product_initiatives WHERE cause_hash=?', causeHash);
  if (prior) return { initiativeId: prior.id, replayed: true, causeHash, ...payload };
  const id = `product-initiative-${causeHash.slice(0, 24)}`;
  await db.run(`INSERT INTO studio_product_initiatives
    (id,release_id,contract_id,action,cause_hash,payload_json) VALUES(?,?,?,?,?,?)`,
  id, target.release.row.id, target.contract.contractId, payload.action, causeHash,
  contracts.canonical(payload));
  return { initiativeId: id, replayed: false, causeHash, ...payload };
}

async function review(db, context) {
  return withTransaction(db, async () => {
    const target = await subject(db, context);
    const rows = await observations(db, target);
    const action = actionFor(rows);
    return persistInitiative(db, target, initiativePayload(target, rows, action));
  });
}

module.exports = { actionFor, observe, review, verdict };
