'use strict';

const { digest } = require('../../evidenceContractService');
const receipts = require('../../epistemicVerifierReceiptService');
const trust = require('../../verifierTrustRegistry');

const SCHEMA = 'genos.biome-goal-verification-receipt/v2';
const SUBJECT_SCHEMA = 'genos.biome-goal-verification-subject/v1';
const AUTHORITY = trust.ensureVerifier('proof', '1.0');
const HASH = /^sha256:[a-f0-9]{64}$/;

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identity(value) {
  return text(value)?.normalize('NFKC').toLowerCase() || null;
}

function authorityIdentity(value) {
  const normalized = identity(value);
  const aliases = [AUTHORITY.id, AUTHORITY.type, AUTHORITY.digest].map(identity);
  return aliases.includes(normalized) ? identity(AUTHORITY.digest) : normalized;
}

function evidenceRefs(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].sort();
}

function subject(input = {}) {
  return { schema: SUBJECT_SCHEMA, missionId: identity(input.missionId),
    producerId: identity(input.producerId), sessionId: identity(input.sessionId),
    tick: input.tick, measurements: input.measurements || null,
    state: { health: input.health || null },
    goal: { verified: input.verified === true },
    terminal: { stopCondition: input.stopCondition || null,
      status: input.status || null }, evidenceRefs: evidenceRefs(input.evidenceRefs) };
}

function resultId(value) {
  return `biome-goal:${digest({ missionId: value.missionId,
    sessionId: value.sessionId, tick: value.tick })}`;
}

function issue(input = {}) {
  const sealed = subject(input);
  const signedReceipt = receipts.issueReceipt({ resultId: resultId(sealed),
    evidenceDigest: digest(sealed), verifierDigest: AUTHORITY.digest,
    independent: true, independenceDescriptor: {
      actorId: AUTHORITY.id, authority: AUTHORITY.digest } });
  return { schema: SCHEMA, missionId: sealed.missionId,
    producerId: sealed.producerId, sessionId: sealed.sessionId,
    tick: sealed.tick, evidenceRefs: sealed.evidenceRefs,
    verifierDigest: AUTHORITY.digest, subjectHash: digest(sealed), signedReceipt };
}

function identityIssue(receipt) {
  const identities = [receipt.missionId, receipt.producerId, receipt.sessionId];
  if (identities.some((value) => !identity(value))
      || !Number.isSafeInteger(receipt.tick) || receipt.tick < 1) {
    return 'biome_goal_oracle_receipt_invalid';
  }
  return null;
}

function independenceIssue(receipt) {
  if (receipt.verifierDigest !== AUTHORITY.digest
      || authorityIdentity(receipt.producerId) === authorityIdentity(AUTHORITY.digest)) {
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

function signedIssue(receipt) {
  const signed = receipt.signedReceipt;
  const authority = signed?.independenceDescriptor;
  const bound = signed?.resultId === resultId(receipt)
    && signed?.evidenceDigest === receipt.subjectHash
    && signed?.verifierDigest === receipt.verifierDigest
    && signed?.independent === true && authority?.actorId === AUTHORITY.id
    && authority?.authority === AUTHORITY.digest;
  return bound && receipts.validateReceipt(signed, [AUTHORITY.digest])
    ? null : 'biome_goal_oracle_attestation_invalid';
}

function shapeIssue(receipt) {
  if (!receipt || receipt.schema !== SCHEMA) return 'biome_goal_oracle_receipt_missing';
  return identityIssue(receipt) || independenceIssue(receipt)
    || evidenceShapeIssue(receipt) || signedIssue(receipt);
}

function scopeIssue(receipt, expected = {}) {
  const textFields = ['missionId', 'producerId', 'sessionId'];
  const mismatch = textFields.some((field) => expected[field] !== undefined
    && identity(receipt[field]) !== identity(expected[field]));
  return mismatch || (expected.tick !== undefined && receipt.tick !== expected.tick)
    ? 'biome_goal_oracle_scope_mismatch' : null;
}

function evidenceIssue(receipt, available = []) {
  const actual = evidenceRefs(receipt.evidenceRefs);
  const expected = evidenceRefs(available);
  return actual.length === expected.length
    && actual.every((reference, index) => reference === expected[index])
    ? null : 'biome_goal_oracle_evidence_mismatch';
}

function subjectIssue(receipt, expected) {
  return receipt.subjectHash === digest(subject(expected))
    ? null : 'biome_goal_oracle_subject_mismatch';
}

function assess(receipt, expected = {}) {
  const problem = shapeIssue(receipt) || scopeIssue(receipt || {}, expected)
    || evidenceIssue(receipt || {}, expected.evidenceRefs)
    || subjectIssue(receipt || {}, expected);
  return { verified: !problem, reason: problem };
}

module.exports = { SCHEMA, VERIFIER_DIGEST: AUTHORITY.digest,
  issue, assess, subject };
