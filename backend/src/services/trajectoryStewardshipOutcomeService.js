'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const { consumeAuthorization } = require('./shev/authorityService');
const responsibilityStore = require('./trajectoryStewardshipStoreService');
const outcomeMigration = require('../db/migrations/migrateTrajectoryStewardshipOutcomes');

const VERDICTS = new Set(['supported', 'refuted', 'inconclusive']);

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw coded('TRAJECTORY_OUTCOME_INVALID', `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function proof(value, kind) {
  const verdict = required(value?.verdict, `${kind}Proof.verdict`);
  if (!VERDICTS.has(verdict)) throw coded('TRAJECTORY_OUTCOME_INVALID', `${kind} proof verdict is invalid.`);
  return {
    evidenceRef: required(value?.evidenceRef, `${kind}Proof.evidenceRef`),
    verifierId: required(value?.verifierId, `${kind}Proof.verifierId`),
    verdict,
    subjectRef: required(value?.subjectRef, `${kind}Proof.subjectRef`)
  };
}

function promotionStatus(projectProof, learningProof) {
  if (projectProof.verdict === 'refuted' || learningProof.verdict === 'refuted') return 'REJECTED';
  if (projectProof.verdict === 'supported' && learningProof.verdict === 'supported') return 'PROMOTED';
  return 'INCONCLUSIVE';
}

function normalize(input, responsibility) {
  const projectProof = proof(input?.projectProof, 'project');
  const learningProof = proof(input?.learningProof, 'learning');
  if (projectProof.verifierId === learningProof.verifierId
    || projectProof.evidenceRef === learningProof.evidenceRef) {
    throw coded('TRAJECTORY_OUTCOME_PROOFS_NOT_INDEPENDENT', 'Project and learning proofs must be independently sourced.');
  }
  if (projectProof.subjectRef !== responsibility.objectiveRef
    || learningProof.subjectRef !== responsibility.agentId) {
    throw coded('TRAJECTORY_OUTCOME_SUBJECT_MISMATCH', 'Proofs do not bind the project objective and responsible agent.');
  }
  const recordedAt = required(input?.recordedAt, 'recordedAt');
  if (Number.isNaN(Date.parse(recordedAt))) throw coded('TRAJECTORY_OUTCOME_INVALID', 'recordedAt must be an ISO date.');
  return {
    organizationId: required(input.organizationId, 'organizationId'),
    projectId: required(input.projectId, 'projectId'),
    responsibilityId: responsibility.responsibilityId,
    policyId: required(input.policyId, 'policyId'),
    projectProof,
    learningProof,
    status: promotionStatus(projectProof, learningProof),
    recordedAt: new Date(recordedAt).toISOString(),
    authorization: input.authorization
  };
}

function expectedAuthorization(input) {
  const authorization = input.authorization;
  if (!authorization) throw coded('TRAJECTORY_OUTCOME_AUTHORIZATION_INVALID', 'Promotion authorization is required.');
  const expected = {
    operation: 'trajectory-stewardship-outcome',
    projectId: input.projectId,
    subjectId: input.responsibilityId,
    expectedVersion: 1,
    details: { responsibilityId: input.responsibilityId,
      projectEvidenceRef: input.projectProof.evidenceRef,
      learningEvidenceRef: input.learningProof.evidenceRef,
      policyId: input.policyId },
    nonce: authorization.nonce,
    expiresAt: authorization.expiresAt,
    signature: authorization.signature
  };
  const sameScope = authorization.operation === expected.operation
    && authorization.projectId === expected.projectId
    && authorization.subjectId === expected.subjectId
    && authorization.expectedVersion === expected.expectedVersion
    && canonicalJson(authorization.details) === canonicalJson(expected.details);
  if (!sameScope) throw coded('TRAJECTORY_OUTCOME_AUTHORIZATION_INVALID', 'Promotion authorization scope is invalid.');
  return expected;
}

function seal(input) {
  const body = {
    schemaVersion: 1,
    outcomeId: `outcome_${digest([input.organizationId, input.projectId,
      input.responsibilityId]).slice(0, 24)}`,
    organizationId: input.organizationId,
    projectId: input.projectId,
    responsibilityId: input.responsibilityId,
    promotionStatus: input.status,
    projectProof: input.projectProof,
    learningProof: input.learningProof,
    policyId: input.policyId,
    authorizationRef: `shev-authorization:${input.authorization.nonce}`,
    recordedAt: input.recordedAt
  };
  return { ...body, receiptId: `stewardship_outcome_${digest(body).slice(0, 24)}` };
}

function parse(row) {
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw coded('TRAJECTORY_OUTCOME_INTEGRITY_FAILED', 'Stored outcome is not valid JSON.');
  }
  if (row.content_hash !== digest(receipt) || row.receipt_id !== receipt.receiptId) {
    throw coded('TRAJECTORY_OUTCOME_INTEGRITY_FAILED', 'Stored outcome integrity failed.');
  }
  return receipt;
}

async function existing(db, input) {
  return db.get(`SELECT * FROM trajectory_stewardship_outcomes
    WHERE organization_id=? AND project_id=? AND responsibility_id=?`,
  input.organizationId, input.projectId, input.responsibilityId);
}

async function persist(db, receipt) {
  await db.run(`INSERT INTO trajectory_stewardship_outcomes
    (organization_id, project_id, outcome_id, responsibility_id, promotion_status,
     project_verdict, learning_verdict, project_evidence_ref, learning_evidence_ref,
     project_verifier_id, learning_verifier_id, policy_id, authorization_ref,
     receipt_id, content_hash, receipt_json, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  receipt.organizationId, receipt.projectId, receipt.outcomeId, receipt.responsibilityId,
  receipt.promotionStatus, receipt.projectProof.verdict, receipt.learningProof.verdict,
  receipt.projectProof.evidenceRef, receipt.learningProof.evidenceRef,
  receipt.projectProof.verifierId, receipt.learningProof.verifierId, receipt.policyId,
  receipt.authorizationRef, receipt.receiptId, digest(receipt), canonicalJson(receipt), receipt.recordedAt);
}

async function recordOutcome(db, rawInput) {
  await outcomeMigration.migrateTrajectoryStewardshipOutcomes(db);
  const responsibility = await responsibilityStore.getResponsibility(db, rawInput);
  const input = normalize(rawInput, responsibility);
  const receipt = seal(input);
  const replay = await existing(db, input);
  if (replay) {
    const stored = parse(replay);
    if (digest(stored) !== digest(receipt)) {
      throw coded('TRAJECTORY_OUTCOME_IDEMPOTENCY_CONFLICT', 'Responsibility already has a divergent outcome.');
    }
    return { receipt: stored, replayed: true };
  }
  const authorization = expectedAuthorization(input);
  await withTransaction(db, async () => {
    await consumeAuthorization(db, authorization);
    await persist(db, receipt);
  });
  return { receipt, replayed: false };
}

async function getOutcome(db, input) {
  await outcomeMigration.migrateTrajectoryStewardshipOutcomes(db);
  const row = await existing(db, {
    organizationId: required(input?.organizationId, 'organizationId'),
    projectId: required(input?.projectId, 'projectId'),
    responsibilityId: required(input?.responsibilityId, 'responsibilityId')
  });
  if (!row) throw coded('TRAJECTORY_OUTCOME_NOT_FOUND', 'Scoped responsibility outcome was not found.');
  return parse(row);
}

module.exports = { recordOutcome, getOutcome, promotionStatus };
