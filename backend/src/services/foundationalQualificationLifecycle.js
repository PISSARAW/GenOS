'use strict';

const { canonicalValue, fingerprint } = require('./stateFingerprint');
const qualification = require('./foundationalPrincipleQualification');
const revocationAuthority = require('./foundationalRevocationAuthority');

const ASSESSMENT_SCHEMA = 'genos.foundational-qualification-assessment/v1';

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function instant(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function unique(values) {
  return [...new Set(values)].sort();
}

function receiptIntegrity(receipt) {
  if (!receipt || receipt.schema !== qualification.RECEIPT_SCHEMA) return false;
  const { receiptHash, ...body } = receipt;
  return typeof receiptHash === 'string' && fingerprint(canonicalValue(body)) === receiptHash;
}

function inspectRevocations(input) {
  return revocationAuthority.inspect({ ledger: input.revocationLedger,
    trustRegistry: input.revocationTrustRegistry,
    now: new Date(input.nowMs).toISOString() });
}

function evidenceWindow(input) {
  const policy = input.manifest.lifecyclePolicy;
  const times = input.manifest.evidenceSuite.map((test) =>
    instant(input.observations?.[test]?.observedAt));
  if (times.some((value) => value === null)) {
    return { reasons: ['evidence-time-invalid'], validUntil: null };
  }
  const reasons = [];
  if (times.some((value) => value > input.nowMs + policy.maxFutureSkewMs)) {
    reasons.push('evidence-from-future');
  }
  if (times.some((value) => input.nowMs - value > policy.evidenceMaxAgeMs)) {
    reasons.push('evidence-stale');
  }
  return { reasons, validUntil: new Date(Math.min(...times) + policy.evidenceMaxAgeMs).toISOString() };
}

function qualificationState(input) {
  try {
    const currentReceipt = qualification.qualify(input);
    const reasons = receiptIntegrity(input.persistedReceipt) ? [] : ['persisted-receipt-invalid'];
    if (currentReceipt.receiptHash !== input.persistedReceipt?.receiptHash) {
      reasons.push('qualification-drift');
    }
    return { currentReceipt, reasons };
  } catch (error) {
    return { currentReceipt: null, reasons: [`qualification-failed:${error.code || 'UNKNOWN'}`] };
  }
}

function assessmentBody(input, state) {
  const revocations = inspectRevocations(input);
  const revoked = revocations.valid && revocations.activeReceiptHashes
    .includes(input.persistedReceipt?.receiptHash);
  const ledgerReasons = revocations.valid ? [] : [`revocation-invalid:${revocations.reason}`];
  const reasons = unique([...state.reasons, ...ledgerReasons,
    ...state.window.reasons, ...(revoked ? ['qualification-revoked'] : [])]);
  const status = revoked ? 'revoked' : reasons.length > 0 ? 'quarantined' : 'current';
  return { schema: ASSESSMENT_SCHEMA, qualificationReceiptHash:
      input.persistedReceipt?.receiptHash || null,
    qualificationRevision: input.manifest.qualificationRevision,
    assessedAt: new Date(input.nowMs).toISOString(), validUntil: state.window.validUntil,
    status, disposition: status === 'current' ? 'retain' : status,
    effectiveScore: status === 'current' ? 4 : null, reasons,
    universalClaim: false, authorizesPromotion: false };
}

function assess(input) {
  const nowMs = instant(input.now);
  if (nowMs === null) throw failure('FOUNDATION_ASSESSMENT_TIME_INVALID');
  const base = { ...input, nowMs };
  const qualified = qualificationState(base);
  const window = evidenceWindow(base);
  const body = assessmentBody(base, { reasons: qualified.reasons, window });
  return { ...body, assessmentHash: fingerprint(body) };
}

function assertCurrent(assessment) {
  if (assessment?.status !== 'current' || assessment.effectiveScore !== 4) {
    throw failure('FOUNDATION_QUALIFICATION_NOT_CURRENT');
  }
  return assessment;
}

module.exports = { ASSESSMENT_SCHEMA, LEDGER_SCHEMA: revocationAuthority.LEDGER_SCHEMA,
  TRUST_SCHEMA: revocationAuthority.TRUST_SCHEMA, assess, assertCurrent, receiptIntegrity };
