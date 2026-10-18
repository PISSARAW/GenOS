'use strict';

const { canonicalValue, fingerprint } = require('./stateFingerprint');
const qualification = require('./foundationalPrincipleQualification');

const ASSESSMENT_SCHEMA = 'genos.foundational-qualification-assessment/v1';
const LEDGER_SCHEMA = 'genos.foundational-qualification-revocations/v1';

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

function validRevocation(item, identities) {
  if (!item || !/^[a-f0-9]{64}$/.test(item.receiptHash)) return false;
  if (typeof item.authority !== 'string' || !item.authority.trim()) return false;
  if (typeof item.reason !== 'string' || !item.reason.trim()) return false;
  if (instant(item.revokedAt) === null || identities.has(item.receiptHash)) return false;
  return true;
}

function ledgerReasons(ledger) {
  if (!ledger || ledger.schema !== LEDGER_SCHEMA || !Array.isArray(ledger.revocations)) {
    return ['revocation-ledger-invalid'];
  }
  const identities = new Set();
  for (const item of ledger.revocations) {
    if (!validRevocation(item, identities)) return ['revocation-ledger-invalid'];
    identities.add(item.receiptHash);
  }
  return [];
}

function activeRevocation(input) {
  if (ledgerReasons(input.revocationLedger).length > 0) return false;
  return input.revocationLedger.revocations.some((item) =>
    item.receiptHash === input.persistedReceipt?.receiptHash
      && instant(item.revokedAt) <= input.nowMs);
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
  const revoked = activeRevocation(input);
  const reasons = unique([...state.reasons, ...ledgerReasons(input.revocationLedger),
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

module.exports = { ASSESSMENT_SCHEMA, LEDGER_SCHEMA, assess, assertCurrent,
  receiptIntegrity };
