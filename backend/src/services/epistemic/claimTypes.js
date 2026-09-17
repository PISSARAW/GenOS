'use strict';

/**
 * Epistemic claim types and typed evidence contract.
 *
 * Every claim is typed: factual, normative, preference, belief.
 * Every claim must carry typed evidence, not raw confidence.
 * Confidence is downstream of evidence quality, never a substitute for it.
 */

const CLAIM_TYPES = Object.freeze({
  FACTUAL: 'factual',
  NORMATIVE: 'normative',
  PREFERENCE: 'preference',
  BELIEF: 'belief',
});

const EVIDENCE_KINDS = Object.freeze({
  OBSERVATION: 'observation',
  TEST_RESULT: 'test_result',
  REPLAY: 'replay',
  APPROVAL: 'approval',
  LOG: 'log',
  ARTIFACT: 'artifact',
  RECONSTRUCTION: 'reconstruction',
});

function isClaimType(value) {
  return Object.values(CLAIM_TYPES).includes(value);
}

function isEvidenceKind(value) {
  return Object.values(EVIDENCE_KINDS).includes(value);
}

/**
 * Validate a single claim. Returns {valid, errors}.
 * A claim is invalid if:
 *  - missing type
 *  - missing evidence list
 *  - any evidence entry lacks the required typed fields
 */
function _hasPayload(ev) {
  return !!(ev.what || ev.result || ev.hash || ev.path || ev.source);
}

function _evidenceBaseQuality(kind, hasPayload) {
  switch (kind) {
    case EVIDENCE_KINDS.OBSERVATION:
    case EVIDENCE_KINDS.LOG:
      return hasPayload ? 0.55 : 0.2;
    case EVIDENCE_KINDS.TEST_RESULT:
      return hasPayload ? 0.85 : 0.4;
    case EVIDENCE_KINDS.REPLAY:
    case EVIDENCE_KINDS.RECONSTRUCTION:
      return hasPayload ? 0.8 : 0.45;
    case EVIDENCE_KINDS.APPROVAL:
      return hasPayload ? 0.9 : 0.5;
    case EVIDENCE_KINDS.ARTIFACT:
      return hasPayload ? 0.75 : 0.35;
    default:
      return hasPayload ? 0.4 : 0.15;
  }
}

function _validateEvidenceEntry(ev, index) {
  const errors = [];
  if (!ev || typeof ev !== 'object') {
    errors.push(`evidence[${index}] is not an object`);
    return errors;
  }
  if (!isEvidenceKind(ev.kind)) errors.push(`evidence[${index}] has invalid kind: ${ev.kind}`);
  if (!ev.kind) errors.push(`evidence[${index}] missing kind`);
  if (!ev.kind && !_hasPayload(ev)) {
    errors.push(`evidence[${index}] carries no typed payload (kind/what/result/hash/path)`);
  }
  return errors;
}

function validateClaim(claim) {
  const errors = [];
  if (!claim || typeof claim !== 'object') {
    errors.push('claim is not an object');
    return { valid: false, errors };
  }
  if (!CLAIM_TYPES[claim.type] && !Object.values(CLAIM_TYPES).includes(claim.type)) {
    if (!isClaimType(claim.type)) errors.push(`invalid claim type: ${claim.type}`);
  }
  if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) {
    errors.push('claim must carry non-empty typed evidence');
  } else {
    for (let i = 0; i < claim.evidence.length; i++) {
      errors.push(..._validateEvidenceEntry(claim.evidence[i], i));
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Infer evidence quality (0..1) from typed evidence, not from a raw confidence
 * float supplied by the caller. Confidence is downstream.
 *
 * Each evidence entry contributes a base quality depending on its kind and
 * whether it carries the expected payload for that kind.
 */
function evidenceQuality(claim) {
  if (!claim || !Array.isArray(claim.evidence)) return 0;
  let total = 0;
  let count = 0;
  for (const ev of claim.evidence) {
    if (!ev || typeof ev !== 'object') continue;
    const kind = ev.kind;
    let base = 0;
    const hasPayload = !!(ev.what || ev.result || ev.hash || ev.path || ev.source);
    switch (kind) {
      case EVIDENCE_KINDS.OBSERVATION:
      case EVIDENCE_KINDS.LOG:
        base = hasPayload ? 0.55 : 0.2;
        break;
      case EVIDENCE_KINDS.TEST_RESULT:
        base = hasPayload ? 0.85 : 0.4;
        break;
      case EVIDENCE_KINDS.REPLAY:
      case EVIDENCE_KINDS.RECONSTRUCTION:
        base = hasPayload ? 0.8 : 0.45;
        break;
      case EVIDENCE_KINDS.APPROVAL:
        base = hasPayload ? 0.9 : 0.5;
        break;
      case EVIDENCE_KINDS.ARTIFACT:
        base = hasPayload ? 0.75 : 0.35;
        break;
      default:
        base = hasPayload ? 0.4 : 0.15;
    }
    total += base;
    count += 1;
  }
  if (count === 0) return 0;
  return Number((total / count).toFixed(3));
}

/**
 * Derived confidence from a claim. Always 0 if claim is invalid or has no
 * evidence. Otherwise confidence = evidenceQuality, possibly adjusted by
 * claim-type base expectations (see point 4 for stakes-based adjustment).
 */
function confidenceFromEvidence(claim, stakeLevel = 'normal') {
  if (!claim || !validateClaim(claim).valid) return 0;
  const quality = evidenceQuality(claim);
  if (quality === 0) return 0;
  return quality;
}

module.exports = {
  CLAIM_TYPES,
  EVIDENCE_KINDS,
  isClaimType,
  isEvidenceKind,
  validateClaim,
  evidenceQuality,
  confidenceFromEvidence,
};
