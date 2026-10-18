'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('./stateFingerprint');

const DOSSIER_SCHEMA = 'genos.promotion-evidence-dossier/v1';
const DECISION_SCHEMA = 'genos.promotion-evidence-decision/v1';
const DEFAULT_POLICY = Object.freeze({
  minimumIndependentVerifiers: 2,
  requireFalsification: true,
  requireCausalReplay: true
});

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function parseCanonical(json, code) {
  try {
    const value = JSON.parse(json);
    if (canonicalJson(value) !== json) throw failure(code);
    return value;
  } catch (error) {
    if (error.code === code) throw error;
    throw failure(code);
  }
}

function text(value, code, maximum = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw failure(code);
  return value.trim();
}

function digest(value, code) {
  const normalized = text(value, code, 128).replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/i.test(normalized)) throw failure(code);
  return normalized.toLowerCase();
}

function normalizeClaims(claims) {
  if (!Array.isArray(claims) || claims.length === 0 || claims.length > 64) {
    throw failure('PROMOTION_EVIDENCE_CLAIMS_REQUIRED');
  }
  const normalized = claims.map((claim) => ({
    id: text(claim?.id, 'PROMOTION_EVIDENCE_CLAIM_ID_REQUIRED'),
    statement: text(claim?.statement, 'PROMOTION_EVIDENCE_CLAIM_STATEMENT_REQUIRED', 2048)
  }));
  if (new Set(normalized.map((claim) => claim.id)).size !== normalized.length) {
    throw failure('PROMOTION_EVIDENCE_CLAIM_ID_DUPLICATE');
  }
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

function normalizePolicy(policy = {}) {
  const quorum = policy.minimumIndependentVerifiers
    ?? DEFAULT_POLICY.minimumIndependentVerifiers;
  if (!Number.isInteger(quorum) || quorum < 1 || quorum > 8) {
    throw failure('PROMOTION_EVIDENCE_POLICY_INVALID');
  }
  return {
    minimumIndependentVerifiers: quorum,
    requireFalsification: policy.requireFalsification !== false,
    requireCausalReplay: policy.requireCausalReplay !== false
  };
}

function evidenceRecord(input) {
  const record = {
    schema: 'genos.promotion-evidence-item/v1',
    id: text(input?.id, 'PROMOTION_EVIDENCE_ID_REQUIRED'),
    dossierId: text(input?.dossierId, 'PROMOTION_EVIDENCE_DOSSIER_REQUIRED'),
    claimId: text(input?.claimId, 'PROMOTION_EVIDENCE_CLAIM_ID_REQUIRED'),
    kind: text(input?.kind, 'PROMOTION_EVIDENCE_KIND_REQUIRED'),
    status: text(input?.status, 'PROMOTION_EVIDENCE_STATUS_REQUIRED'),
    sourceRef: text(input?.sourceRef, 'PROMOTION_EVIDENCE_SOURCE_REQUIRED', 2048),
    sourceHash: digest(input?.sourceHash, 'PROMOTION_EVIDENCE_SOURCE_HASH_INVALID'),
    producerId: text(input?.producerId, 'PROMOTION_EVIDENCE_PRODUCER_REQUIRED'),
    verifierId: text(input?.verifierId, 'PROMOTION_EVIDENCE_VERIFIER_REQUIRED'),
    independent: input?.independent === true,
    payload: canonicalValue(input?.payload || {})
  };
  if (!['supporting', 'refuting', 'context'].includes(record.kind)) {
    throw failure('PROMOTION_EVIDENCE_KIND_INVALID');
  }
  if (!['verified', 'rejected', 'inconclusive'].includes(record.status)) {
    throw failure('PROMOTION_EVIDENCE_STATUS_INVALID');
  }
  return { ...record, evidenceHash: fingerprint(record) };
}

function falsificationRecord(input) {
  const record = {
    schema: 'genos.promotion-falsification-attempt/v1',
    id: text(input?.id, 'PROMOTION_FALSIFICATION_ID_REQUIRED'),
    dossierId: text(input?.dossierId, 'PROMOTION_EVIDENCE_DOSSIER_REQUIRED'),
    claimId: text(input?.claimId, 'PROMOTION_EVIDENCE_CLAIM_ID_REQUIRED'),
    method: text(input?.method, 'PROMOTION_FALSIFICATION_METHOD_REQUIRED', 2048),
    verifierId: text(input?.verifierId, 'PROMOTION_EVIDENCE_VERIFIER_REQUIRED'),
    independent: input?.independent === true,
    outcome: text(input?.outcome, 'PROMOTION_FALSIFICATION_OUTCOME_REQUIRED'),
    counterexample: canonicalValue(input?.counterexample || {})
  };
  if (!['survived', 'refuted', 'inconclusive'].includes(record.outcome)) {
    throw failure('PROMOTION_FALSIFICATION_OUTCOME_INVALID');
  }
  return { ...record, attemptHash: fingerprint(record) };
}

function claimSatisfied(input) {
  const verifiers = new Set(input.evidence.filter((item) => item.claimId === input.claimId
    && item.kind === 'supporting' && item.status === 'verified' && item.independent)
    .map((item) => item.verifierId));
  const falsified = input.attempts.some((attempt) => attempt.claimId === input.claimId
    && attempt.outcome === 'survived' && attempt.independent);
  return verifiers.size >= input.policy.minimumIndependentVerifiers
    && (!input.policy.requireFalsification || falsified);
}

function evaluate(input) {
  if (input.integrityIssues?.length) {
    return { disposition: 'quarantine', reasons: [...input.integrityIssues].sort() };
  }
  const refuted = input.evidence.some((item) => item.kind === 'refuting'
    && item.status === 'verified')
    || input.attempts.some((attempt) => attempt.outcome === 'refuted');
  if (refuted) return { disposition: 'reject', reasons: ['verified-counterexample'] };
  const missing = input.claims.filter((claim) => !claimSatisfied({ claimId: claim.id,
    evidence: input.evidence, attempts: input.attempts, policy: input.policy }))
    .map((claim) => claim.id);
  if (input.policy.requireCausalReplay && input.replayVerified !== true) missing.push('causal-replay');
  if (missing.length) return { disposition: 'escalate', reasons: [...new Set(missing)].sort() };
  return { disposition: 'promote', reasons: ['independent-evidence-and-falsification-satisfied'] };
}

function decisionReceipt(input) {
  const body = {
    schema: DECISION_SCHEMA,
    id: text(input.id, 'PROMOTION_DECISION_ID_REQUIRED'),
    dossierId: input.dossierId,
    runId: input.runId,
    agentId: input.agentId,
    replayReceiptId: input.replayReceiptId,
    authorityHash: input.authorityHash,
    claimsHash: fingerprint(input.claims),
    evidenceHashes: input.evidence.map((item) => item.evidenceHash).sort(),
    falsificationHashes: input.attempts.map((item) => item.attemptHash).sort(),
    disposition: input.decision.disposition,
    reasons: input.decision.reasons,
    promotionEligible: input.decision.disposition === 'promote',
    authorizesPromotion: false,
    requiresExistingPromotionGate: true
  };
  return { ...body, receiptHash: fingerprint(body) };
}

function identifier(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

module.exports = { DOSSIER_SCHEMA, DECISION_SCHEMA, DEFAULT_POLICY, canonicalJson,
  parseCanonical, normalizeClaims, normalizePolicy, evidenceRecord, falsificationRecord,
  evaluate, decisionReceipt, identifier, failure };
