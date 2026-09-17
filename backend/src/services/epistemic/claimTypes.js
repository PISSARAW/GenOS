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

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isClaimType(value) {
  return Object.values(CLAIM_TYPES).includes(value);
}

function isEvidenceKind(value) {
  return Object.values(EVIDENCE_KINDS).includes(value);
}

// ---------------------------------------------------------------------------
// Evidence payload detection
// ---------------------------------------------------------------------------

function _hasAnyPayloadField(ev) {
  const fields = ['what', 'result', 'hash', 'path', 'source'];
  for (const f of fields) {
    if (ev[f] !== undefined && ev[f] !== null) return true;
  }
  return false;
}

function _entryHasPayload(ev) {
  if (!ev || typeof ev !== 'object') return false;
  return _hasAnyPayloadField(ev);
}

// ---------------------------------------------------------------------------
// Evidence entry validation
// ---------------------------------------------------------------------------

function _validateEvidenceEntry(ev, index) {
  const errors = [];
  if (!_entryHasPayload(ev) && typeof ev !== 'object') {
    errors.push(`evidence[${index}] is not an object`);
    return errors;
  }
  if (!isEvidenceKind(ev.kind)) {
    errors.push(`evidence[${index}] has invalid kind: ${ev.kind}`);
  }
  if (!ev.kind) {
    errors.push(`evidence[${index}] missing kind`);
  }
  if (!ev.kind && !_hasAnyPayloadField(ev)) {
    errors.push(`evidence[${index}] carries no typed payload (kind/what/result/hash/path)`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Claim type validation
// ---------------------------------------------------------------------------

function _claimTypeIsRecognised(type) {
  if (CLAIM_TYPES[type]) return true;
  return Object.values(CLAIM_TYPES).includes(type);
}

// ---------------------------------------------------------------------------
// Claim validation
// ---------------------------------------------------------------------------

function validateClaim(claim) {
  const errors = [];
  if (!_isPlainObject(claim)) {
    errors.push('claim is not an object');
    return { valid: false, errors };
  }
  if (!_claimTypeIsRecognised(claim.type)) {
    errors.push(`invalid claim type: ${claim.type}`);
  }
  if (!_claimHasEvidence(claim)) {
    errors.push('claim must carry non-empty typed evidence');
  } else {
    _collectEvidenceErrors(claim, errors);
  }
  return { valid: errors.length === 0, errors };
}

function _isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function _claimHasEvidence(claim) {
  return Array.isArray(claim.evidence) && claim.evidence.length > 0;
}

function _collectEvidenceErrors(claim, errors) {
  const evidence = claim.evidence;
  for (let i = 0; i < evidence.length; i++) {
    errors.push(..._validateEvidenceEntry(evidence[i], i));
  }
}

// ---------------------------------------------------------------------------
// Evidence base quality lookup (replaces switch + ternary)
// ---------------------------------------------------------------------------

const _EVIDENCE_BASE_TABLE = Object.freeze({
  [EVIDENCE_KINDS.OBSERVATION]: { withPayload: 0.55, without: 0.2 },
  [EVIDENCE_KINDS.LOG]: { withPayload: 0.55, without: 0.2 },
  [EVIDENCE_KINDS.TEST_RESULT]: { withPayload: 0.85, without: 0.4 },
  [EVIDENCE_KINDS.REPLAY]: { withPayload: 0.8, without: 0.45 },
  [EVIDENCE_KINDS.RECONSTRUCTION]: { withPayload: 0.8, without: 0.45 },
  [EVIDENCE_KINDS.APPROVAL]: { withPayload: 0.9, without: 0.5 },
  [EVIDENCE_KINDS.ARTIFACT]: { withPayload: 0.75, without: 0.35 },
});

function _lookupEvidenceBase(kind) {
  const entry = _EVIDENCE_BASE_TABLE[kind];
  if (!entry) return null;
  return entry;
}

function _evidenceBaseQuality(kind, hasPayload) {
  const entry = _lookupEvidenceBase(kind);
  if (!entry) return _fallbackEvidenceBase(hasPayload);
  return _selectFromEntry(entry, hasPayload);
}

function _fallbackEvidenceBase(hasPayload) {
  return hasPayload ? 0.4 : 0.15;
}

function _selectFromEntry(entry, hasPayload) {
  return hasPayload ? entry.withPayload : entry.without;
}

// ---------------------------------------------------------------------------
// Evidence quality aggregation
// ---------------------------------------------------------------------------

function evidenceQuality(claim) {
  if (!_claimHasEvidence(claim)) return 0;
  const { total, count } = _aggregateEvidenceQuality(claim.evidence);
  if (count === 0) return 0;
  return _roundToThree(total / count);
}

function _aggregateEvidenceQuality(evidence) {
  let total = 0;
  let count = 0;
  for (const ev of evidence) {
    if (!_entryHasPayload(ev) && typeof ev !== 'object') continue;
    const kind = ev.kind;
    const hasPayload = _hasAnyPayloadField(ev);
    total += _evidenceBaseQuality(kind, hasPayload);
    count += 1;
  }
  return { total, count };
}

function _roundToThree(value) {
  return Number(value.toFixed(3));
}

// ---------------------------------------------------------------------------
// Derived confidence from a claim
// ---------------------------------------------------------------------------

function confidenceFromEvidence(claim, stakeLevel) {
  if (stakeLevel === undefined) stakeLevel = 'normal';
  if (!_claimIsValid(claim)) return 0;
  const quality = evidenceQuality(claim);
  if (quality === 0) return 0;
  return quality;
}

function _claimIsValid(claim) {
  if (!_isPlainObject(claim)) return false;
  const validation = validateClaim(claim);
  return validation.valid;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CLAIM_TYPES,
  EVIDENCE_KINDS,
  isClaimType,
  isEvidenceKind,
  validateClaim,
  evidenceQuality,
  confidenceFromEvidence,
};
