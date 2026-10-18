'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('./stateFingerprint');
const lifecycle = require('./foundationalQualificationLifecycle');
const revocations = require('./foundationalRevocationAuthority');

const ADMISSION_SCHEMA = 'genos.foundational-qualification-admission/v1';

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function instant(value, code) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw failure(code);
  return parsed;
}

function assertRequest(input) {
  const policy = input.manifest.admissionPolicy;
  const request = input.request;
  if (!policy.allowedConsumers.includes(request?.consumerId)) {
    throw failure('FOUNDATION_ADMISSION_CONSUMER_DENIED');
  }
  if (typeof request.purpose !== 'string' || !request.purpose.trim()) {
    throw failure('FOUNDATION_ADMISSION_PURPOSE_REQUIRED');
  }
  if (!Number.isInteger(request.ttlMs) || request.ttlMs < 1
    || request.ttlMs > policy.maxLeaseMs) {
    throw failure('FOUNDATION_ADMISSION_TTL_INVALID');
  }
}

function admissionBody(input, assessment) {
  const issuedAt = instant(input.now, 'FOUNDATION_ADMISSION_TIME_INVALID');
  const evidenceLimit = instant(assessment.validUntil, 'FOUNDATION_ADMISSION_EVIDENCE_EXPIRED');
  const expiresAt = Math.min(issuedAt + input.request.ttlMs, evidenceLimit);
  if (expiresAt <= issuedAt) throw failure('FOUNDATION_ADMISSION_EVIDENCE_EXPIRED');
  return { schema: ADMISSION_SCHEMA, status: 'admitted', issuerId: input.issuer?.id,
    consumerId: input.request.consumerId, purpose: input.request.purpose.trim(),
    qualificationReceiptHash: assessment.qualificationReceiptHash,
    qualificationAssessmentHash: assessment.assessmentHash,
    issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
    effectiveScore: 4, universalClaim: false, authorizesPromotion: false };
}

function payload(body) {
  return Buffer.from(JSON.stringify(canonicalValue(body)));
}

function sign(body, issuer) {
  if (typeof issuer?.id !== 'string' || !issuer.id.trim()) {
    throw failure('FOUNDATION_ADMISSION_ISSUER_REQUIRED');
  }
  try {
    return crypto.sign(null, payload(body), issuer.privateKey).toString('base64');
  } catch (_) {
    throw failure('FOUNDATION_ADMISSION_SIGNING_FAILED');
  }
}

function issuerKey(input, issuerId) {
  const registry = input.trustRegistry;
  if (!registry || registry.schema !== revocations.TRUST_SCHEMA
    || !Array.isArray(registry.authorities)) return null;
  const authority = registry.authorities.find((item) =>
    item.id === issuerId && item.status === 'active');
  return authority?.publicKey || null;
}

function validSignature(input, body, signature) {
  const publicKey = issuerKey(input, body.issuerId);
  if (!publicKey) return false;
  try {
    return crypto.verify(null, payload(body), publicKey,
      Buffer.from(signature || '', 'base64'));
  } catch (_) {
    return false;
  }
}

function admit(input) {
  assertRequest(input);
  const assessment = lifecycle.assess(input);
  lifecycle.assertCurrent(assessment);
  const body = admissionBody(input, assessment);
  const signature = sign(body, input.issuer);
  return { ...body, signature, admissionHash: fingerprint({ ...body, signature }) };
}

function assertUsable(input) {
  const admission = input.admission;
  if (!admission || admission.schema !== ADMISSION_SCHEMA) {
    throw failure('FOUNDATION_ADMISSION_INVALID');
  }
  const { admissionHash, signature, ...body } = admission;
  const intact = fingerprint({ ...body, signature }) === admissionHash;
  if (!intact || admission.status !== 'admitted'
    || !validSignature(input, body, signature)) {
    throw failure('FOUNDATION_ADMISSION_INVALID');
  }
  if (admission.consumerId !== input.consumerId) {
    throw failure('FOUNDATION_ADMISSION_CONSUMER_DENIED');
  }
  const now = instant(input.now, 'FOUNDATION_ADMISSION_TIME_INVALID');
  const issuedAt = instant(admission.issuedAt, 'FOUNDATION_ADMISSION_INVALID');
  const expiresAt = instant(admission.expiresAt, 'FOUNDATION_ADMISSION_INVALID');
  if (now < issuedAt || now >= expiresAt) {
    throw failure('FOUNDATION_ADMISSION_EXPIRED');
  }
  if (admission.authorizesPromotion !== false) throw failure('FOUNDATION_ADMISSION_INVALID');
  return admission;
}

module.exports = { ADMISSION_SCHEMA, admit, assertUsable };
