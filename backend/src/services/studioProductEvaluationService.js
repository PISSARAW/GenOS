'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const store = require('./studioProductionStore');
const contracts = require('./studioProductContractService');

const digest = value => crypto.createHash('sha256').update(contracts.canonical(value)).digest('hex');

async function subject(db, context) {
  const release = await store.release(db, context);
  const contract = await contracts.byId(db, { ...context, workflowId: release.row.workflow_id,
    contractId: input.text(context.contractId || context.body.contractId, 200) });
  return { release, contract };
}

function references(value, code) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw failure(code, 400);
  return [...new Set(value.map(item => input.text(item, 500)))];
}

function validateEvaluation(context, contract) {
  const modality = input.text(context.body.modality, 30);
  const criterionIds = references(context.body.criterionIds, 'PRODUCT_CRITERIA_EVIDENCE_REQUIRED');
  const matching = contract.qualityCriteria.filter(item => item.modality === modality).map(item => item.id);
  if (matching.length === 0 || criterionIds.some(id => !matching.includes(id))) {
    throw failure('PRODUCT_EVALUATION_SCOPE_INVALID', 400);
  }
  const verdict = input.text(context.body.verdict, 30);
  if (!['supported', 'refuted', 'inconclusive'].includes(verdict)) {
    throw failure('PRODUCT_EVALUATION_VERDICT_INVALID', 400);
  }
  return { modality, verdict, criterionIds,
    evidenceRefs: references(context.body.evidenceRefs, 'PRODUCT_EVIDENCE_REQUIRED'),
    note: input.text(context.body.note) };
}

async function evaluate(db, context) {
  const target = await subject(db, context);
  if (target.release.row.created_by === context.actor) throw failure('PRODUCT_EVALUATOR_NOT_INDEPENDENT', 409);
  const value = validateEvaluation(context, target.contract);
  const id = `product-eval-${crypto.randomUUID()}`;
  await db.run(`INSERT INTO studio_product_evaluations
    (id,release_id,contract_id,evaluator,modality,verdict,criterion_ids_json,evidence_refs_json,note)
    VALUES(?,?,?,?,?,?,?,?,?)`, id, target.release.row.id, target.contract.contractId,
  context.actor, value.modality, value.verdict, JSON.stringify(value.criterionIds),
  JSON.stringify(value.evidenceRefs), value.note);
  return { evaluationId: id, releaseId: target.release.row.id,
    contractId: target.contract.contractId, evaluator: context.actor, ...value,
    previewOnly: true, acceptanceGranted: false, effectObserved: false };
}

async function rows(db, target) {
  return db.all(`SELECT * FROM studio_product_evaluations
    WHERE release_id=? AND contract_id=? ORDER BY rowid`, target.release.row.id,
  target.contract.contractId);
}

function decide(target, evaluations) {
  const modalities = new Set(evaluations.map(item => item.modality));
  const evaluators = new Set(evaluations.map(item => item.evaluator));
  const covered = new Set(evaluations.flatMap(item => JSON.parse(item.criterion_ids_json)));
  const required = target.contract.qualityCriteria.map(item => item.id);
  const plural = evaluators.size >= 2 && modalities.has('visual') && modalities.has('functional');
  const complete = required.every(id => covered.has(id));
  let decision = 'NO_CHANGE';
  if (evaluations.some(item => item.verdict === 'refuted')) decision = 'REJECT';
  else if (plural && complete && evaluations.every(item => item.verdict === 'supported')) {
    decision = 'READY_FOR_ACCEPTANCE';
  }
  const evidenceHash = digest(evaluations.map(item => ({ id: item.id, evaluator: item.evaluator,
    modality: item.modality, verdict: item.verdict, criterionIds: JSON.parse(item.criterion_ids_json),
    evidenceRefs: JSON.parse(item.evidence_refs_json) })));
  return { decision, evidenceHash, evaluatorCount: evaluators.size,
    modalities: [...modalities].sort(), criteriaCovered: [...covered].sort(),
    previewValidated: decision === 'READY_FOR_ACCEPTANCE', acceptanceGranted: false,
    effectObserved: false, rollbackRecommended: decision === 'REJECT' };
}

async function decision(db, context) {
  const target = await subject(db, context);
  return { releaseId: target.release.row.id, contractId: target.contract.contractId,
    ...decide(target, await rows(db, target)) };
}

async function requireAuthority(db, context) {
  const membership = await db.get('SELECT role FROM project_memberships WHERE principal_id=? AND project_id=?',
    context.actor, context.scope.projectId);
  if (!['owner', 'admin'].includes(membership?.role)) throw failure('PRODUCT_ACCEPTANCE_FORBIDDEN', 403);
}

async function accept(db, context) {
  await requireAuthority(db, context);
  return withTransaction(db, async () => {
    const target = await subject(db, context);
    const current = decide(target, await rows(db, target));
    const requested = input.text(context.body.decision, 30);
    if (!['accepted', 'rejected'].includes(requested)) throw failure('PRODUCT_ACCEPTANCE_INVALID', 400);
    if (requested === 'accepted' && current.decision !== 'READY_FOR_ACCEPTANCE') {
      throw failure('PRODUCT_EVALUATION_INSUFFICIENT', 409);
    }
    const id = `product-accept-${crypto.randomUUID()}`;
    await db.run(`INSERT INTO studio_product_acceptances
      (id,release_id,contract_id,accepted_by,evaluation_hash,decision,note)
      VALUES(?,?,?,?,?,?,?)`, id, target.release.row.id, target.contract.contractId,
    context.actor, current.evidenceHash, requested, input.text(context.body.note));
    return { acceptanceId: id, releaseId: target.release.row.id,
      contractId: target.contract.contractId, acceptedBy: context.actor,
      decision: requested, evaluationHash: current.evidenceHash,
      previewValidated: current.previewValidated, acceptanceGranted: requested === 'accepted',
      effectObserved: false, deploymentTriggered: false };
  });
}

async function requireAcceptance(db, context) {
  const evaluation = await db.get(`SELECT contract_id FROM studio_product_evaluations
    WHERE release_id=? LIMIT 1`, context.releaseId);
  if (!evaluation) return null;
  const current = await decision(db, { ...context, contractId: evaluation.contract_id });
  const accepted = await db.get(`SELECT * FROM studio_product_acceptances
    WHERE release_id=? AND contract_id=? ORDER BY rowid DESC LIMIT 1`, context.releaseId,
  evaluation.contract_id);
  if (!accepted || accepted.decision !== 'accepted' || accepted.evaluation_hash !== current.evidenceHash) {
    throw failure('PRODUCT_ACCEPTANCE_REQUIRED', 409);
  }
  return accepted;
}

module.exports = { accept, decide, decision, evaluate, requireAcceptance };
