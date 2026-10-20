'use strict';

const { digest } = require('../../evidenceContractService');

const SCHEMA = 'genos.biome-goal-verification-receipt/v1';
const HASH = /^sha256:[a-f0-9]{64}$/;

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function evidenceRefs(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((ref) => text(ref)).map((ref) => ref.trim()))];
}

function payload(receipt = {}) {
  return { schema: SCHEMA, missionId: receipt.missionId,
    producerId: receipt.producerId, verifierId: receipt.verifierId,
    independent: receipt.independent, sessionId: receipt.sessionId,
    tick: receipt.tick, verdict: receipt.verdict,
    evidenceRefs: evidenceRefs(receipt.evidenceRefs) };
}

function issue(input = {}) {
  const receipt = payload({ ...input, independent: input.independent === true,
    verdict: input.verdict || 'verified' });
  return { ...receipt, attestation: digest(receipt) };
}

function shapeIssue(receipt) {
  if (!receipt || receipt.schema !== SCHEMA) return 'biome_goal_oracle_receipt_missing';
  return identityIssue(receipt) || independenceIssue(receipt)
    || evidenceShapeIssue(receipt) || attestationIssue(receipt);
}

function identityIssue(receipt) {
  const identities = [receipt.missionId, receipt.producerId, receipt.verifierId,
    receipt.sessionId];
  if (identities.some((value) => !text(value)) || !Number.isSafeInteger(receipt.tick)
      || receipt.tick < 1 || receipt.verdict !== 'verified') {
    return 'biome_goal_oracle_receipt_invalid';
  }
  return null;
}

function independenceIssue(receipt) {
  if (receipt.independent !== true || receipt.verifierId === receipt.producerId) {
    return 'biome_goal_oracle_not_independent';
  }
  return null;
}

function evidenceShapeIssue(receipt) {
  const refs = evidenceRefs(receipt.evidenceRefs);
  if (!refs.length) return 'biome_goal_oracle_evidence_missing';
  return refs.every((reference) => HASH.test(reference))
    ? null : 'biome_goal_oracle_evidence_invalid';
}

function attestationIssue(receipt) {
  return receipt.attestation === digest(payload(receipt))
    ? null : 'biome_goal_oracle_attestation_invalid';
}

function scopeIssue(receipt, expected = {}) {
  const fields = ['missionId', 'producerId', 'sessionId', 'tick'];
  return fields.some((field) => expected[field] !== undefined
    && receipt[field] !== expected[field]) ? 'biome_goal_oracle_scope_mismatch' : null;
}

function evidenceIssue(receipt, available = []) {
  const references = evidenceRefs(receipt.evidenceRefs);
  const allowed = new Set(available);
  return references.every((reference) => allowed.has(reference))
    ? null : 'biome_goal_oracle_evidence_mismatch';
}

function assess(receipt, expected = {}) {
  const issue = shapeIssue(receipt) || scopeIssue(receipt || {}, expected)
    || evidenceIssue(receipt || {}, expected.evidenceRefs);
  return { verified: !issue, reason: issue };
}

module.exports = { SCHEMA, issue, assess, payload };
