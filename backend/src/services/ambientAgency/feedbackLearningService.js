'use strict';

const { withTransaction } = require('../../db');
const { canonicalJson } = require('../aTeam/variants/variantExecutionHelpers');
const ledger = require('./responsibilityLedgerService');

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw ledger.coded(code, 'A non-empty value is required.');
  return value;
}

function stringList(value, code) {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== 'string' || !item)) {
    throw ledger.coded(code, 'A non-empty string list is required.');
  }
  return [...new Set(value)].sort();
}

function feedbackContent(input, responsibility) {
  const payload = input.payload || {};
  return {
    feedbackId: required(payload.feedbackId, 'AMBIENT_FEEDBACK_REQUIRED'),
    responsibilityId: responsibility.responsibilityId,
    responsibilityVersion: responsibility.version,
    proposerId: required(payload.proposerId, 'AMBIENT_PROPOSER_REQUIRED'),
    claim: required(payload.claim, 'AMBIENT_FEEDBACK_CLAIM_REQUIRED'),
    sourceRefs: stringList(payload.sourceRefs, 'AMBIENT_FEEDBACK_SOURCE_REQUIRED'),
    proposedAt: required(payload.proposedAt, 'AMBIENT_FEEDBACK_TIME_REQUIRED')
  };
}

async function recordCandidate(db, input) {
  const scope = ledger.tenant(input);
  await ledger.ensure(db);
  return withTransaction(db, async () => {
    const responsibility = await ledger.currentInTransaction(db, { ...scope,
      responsibilityId: input.payload?.responsibilityId });
    if (responsibility.status !== 'ACTIVE') {
      throw ledger.coded('AMBIENT_RESPONSIBILITY_REVOKED', 'Revoked responsibility cannot learn.');
    }
    const content = feedbackContent(input, responsibility);
    const contentHash = ledger.hash(content);
    const existing = await db.get(`SELECT * FROM ambient_feedback_candidates
      WHERE organization_id=? AND project_id=? AND feedback_id=?`,
    scope.organizationId, scope.projectId, content.feedbackId);
    if (existing) {
      if (existing.content_hash === contentHash) return { candidate: content, replayed: true };
      throw ledger.coded('AMBIENT_FEEDBACK_CONFLICT', 'Feedback identifier is already bound.');
    }
    await db.run(`INSERT INTO ambient_feedback_candidates
      (organization_id,project_id,feedback_id,responsibility_id,responsibility_version,
       proposer_id,content_hash,feedback_json) VALUES (?,?,?,?,?,?,?,?)`,
    scope.organizationId, scope.projectId, content.feedbackId, content.responsibilityId,
    content.responsibilityVersion, content.proposerId, contentHash, canonicalJson(content));
    return { candidate: content, replayed: false };
  });
}

function assertIndependentActors(context) {
  const { responsibility, candidate, verification, authority } = context;
  const verifierId = required(verification?.verifierId, 'AMBIENT_VERIFIER_REQUIRED');
  const authorityId = required(authority?.authorityId, 'AMBIENT_AUTHORITY_REQUIRED');
  const actors = [responsibility.ownerAgentId, candidate.proposerId, verifierId, authorityId];
  if (new Set(actors).size !== actors.length) {
    throw ledger.coded('AMBIENT_INDEPENDENCE_REQUIRED', 'Owner, proposer, verifier and authority must differ.');
  }
  if (authority.disposition !== 'AUTHORIZED') {
    throw ledger.coded('AMBIENT_AUTHORITY_DENIED', 'Learning authority did not authorize the decision.');
  }
  if (authority.responsibilityVersion !== responsibility.version) {
    throw ledger.coded('AMBIENT_AUTHORITY_STALE', 'Learning authority targets another responsibility version.');
  }
}

function learningContent(input, responsibility, candidate) {
  const payload = input.payload || {};
  const verification = payload.verification || {};
  const authority = payload.authority || {};
  assertIndependentActors({ responsibility, candidate, verification, authority });
  if (!['SUPPORTED', 'REJECTED', 'INSUFFICIENT'].includes(verification.verdict)) {
    throw ledger.coded('AMBIENT_VERDICT_INVALID', 'Verification verdict is invalid.');
  }
  return {
    decisionId: required(payload.decisionId, 'AMBIENT_LEARNING_DECISION_REQUIRED'),
    feedbackId: candidate.feedbackId,
    responsibilityId: responsibility.responsibilityId,
    responsibilityVersion: responsibility.version,
    verifierId: verification.verifierId,
    verdict: verification.verdict,
    evidenceRefs: stringList(verification.evidenceRefs, 'AMBIENT_VERIFICATION_EVIDENCE_REQUIRED'),
    authorityId: authority.authorityId,
    authorityRef: required(authority.authorityRef, 'AMBIENT_AUTHORITY_REF_REQUIRED'),
    authorityResponsibilityVersion: authority.responsibilityVersion,
    disposition: authority.disposition,
    decidedAt: required(payload.decidedAt, 'AMBIENT_DECISION_TIME_REQUIRED'),
    eligibleToLearn: verification.verdict === 'SUPPORTED'
  };
}

async function candidateRow(db, scope, feedbackId) {
  return db.get(`SELECT * FROM ambient_feedback_candidates
    WHERE organization_id=? AND project_id=? AND feedback_id=?`,
  scope.organizationId, scope.projectId, feedbackId);
}

async function decide(db, input) {
  const scope = ledger.tenant(input);
  await ledger.ensure(db);
  return withTransaction(db, async () => {
    const row = await candidateRow(db, scope,
      required(input.payload?.feedbackId, 'AMBIENT_FEEDBACK_REQUIRED'));
    if (!row) throw ledger.coded('AMBIENT_FEEDBACK_NOT_FOUND', 'Feedback candidate was not found.');
    const candidate = JSON.parse(row.feedback_json);
    const responsibility = await ledger.currentInTransaction(db, { ...scope,
      responsibilityId: candidate.responsibilityId });
    if (responsibility.status !== 'ACTIVE' || responsibility.version !== candidate.responsibilityVersion) {
      throw ledger.coded('AMBIENT_FEEDBACK_STALE', 'Feedback does not target the current responsibility.');
    }
    const content = learningContent(input, responsibility, candidate);
    const contentHash = ledger.hash(content);
    const existing = await db.get(`SELECT * FROM ambient_learning_decisions
      WHERE organization_id=? AND project_id=? AND feedback_id=?`,
    scope.organizationId, scope.projectId, candidate.feedbackId);
    if (existing) {
      if (existing.content_hash === contentHash) return { decision: content, replayed: true };
      throw ledger.coded('AMBIENT_LEARNING_DECISION_CONFLICT', 'Feedback already has a decision.');
    }
    await db.run(`INSERT INTO ambient_learning_decisions
      (organization_id,project_id,decision_id,feedback_id,content_hash,decision_json)
      VALUES (?,?,?,?,?,?)`, scope.organizationId, scope.projectId, content.decisionId,
    content.feedbackId, contentHash, canonicalJson(content));
    return { decision: content, replayed: false };
  });
}

module.exports = { recordCandidate, decide };
