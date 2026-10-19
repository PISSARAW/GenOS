'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('../stateFingerprint');

const SCHEMA = 'genos.artifact-identity/v1';
const RECEIPT_SCHEMA = 'genos.artifact-admission-receipt/v1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function refusal(code, message) {
  return Object.assign(new Error(message || code), { code });
}

function text(value, code, maximum = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw refusal(code);
  }
  return value.trim();
}

function identifierList(values, code) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) {
    throw refusal(code);
  }
  const normalized = values.map((value) => text(value, code, 256));
  if (new Set(normalized).size !== normalized.length) throw refusal(code);
  return normalized.sort();
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function assertDigest(value, code) {
  if (!DIGEST.test(value || '')) throw refusal(code);
  return value;
}

function normalizeScope(scope) {
  return {
    organizationId: text(scope?.organizationId, 'ARTIFACT_ORGANIZATION_REQUIRED'),
    projectId: text(scope?.projectId, 'ARTIFACT_PROJECT_REQUIRED'),
    environment: text(scope?.environment, 'ARTIFACT_ENVIRONMENT_REQUIRED')
  };
}

function unsignedManifest(input) {
  const issuedAt = text(input.issuedAt, 'ARTIFACT_ISSUED_AT_REQUIRED');
  const expiresAt = text(input.expiresAt, 'ARTIFACT_EXPIRES_AT_REQUIRED');
  if (!Number.isFinite(Date.parse(issuedAt)) || Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw refusal('ARTIFACT_LIFETIME_INVALID');
  }
  return canonicalValue({
    schema: SCHEMA,
    artifactId: text(input.artifactId, 'ARTIFACT_ID_REQUIRED'),
    artifactDigest: assertDigest(input.artifactDigest, 'ARTIFACT_DIGEST_INVALID'),
    sbomDigest: assertDigest(input.sbomDigest, 'ARTIFACT_SBOM_DIGEST_INVALID'),
    provenance: identifierList(input.provenance, 'ARTIFACT_PROVENANCE_REQUIRED'),
    requiredCapabilities: identifierList(input.requiredCapabilities,
      'ARTIFACT_CAPABILITIES_REQUIRED'),
    scope: normalizeScope(input.scope),
    issuerId: text(input.issuerId, 'ARTIFACT_ISSUER_REQUIRED'),
    issuedAt,
    expiresAt
  });
}

function signatureFor(manifest, key) {
  if (!Buffer.isBuffer(key) && typeof key !== 'string') throw refusal('ARTIFACT_SIGNING_KEY_REQUIRED');
  if (Buffer.byteLength(key) < 32) throw refusal('ARTIFACT_SIGNING_KEY_TOO_SHORT');
  return crypto.createHmac('sha256', key).update(JSON.stringify(manifest)).digest('hex');
}

function issue(input, key) {
  const manifest = unsignedManifest(input);
  return { ...manifest, signature: signatureFor(manifest, key) };
}

function exactScope(actual, expected) {
  return actual.organizationId === expected.organizationId
    && actual.projectId === expected.projectId
    && actual.environment === expected.environment;
}

function timingSafeEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left || '') || !/^[a-f0-9]{64}$/.test(right || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function admit(input, key) {
  const { signature, ...rawManifest } = input.manifest || {};
  const manifest = unsignedManifest(rawManifest);
  if (!timingSafeEqual(signature, signatureFor(manifest, key))) {
    throw refusal('ARTIFACT_SIGNATURE_INVALID');
  }
  if (sha256(input.artifactBytes) !== manifest.artifactDigest) {
    throw refusal('ARTIFACT_CONTENT_MISMATCH');
  }
  if (sha256(input.sbomBytes) !== manifest.sbomDigest) throw refusal('ARTIFACT_SBOM_MISMATCH');
  if (!exactScope(manifest.scope, normalizeScope(input.scope))) throw refusal('ARTIFACT_SCOPE_MISMATCH');
  const requested = identifierList(input.requestedCapabilities,
    'ARTIFACT_REQUESTED_CAPABILITIES_REQUIRED');
  if (requested.some((capability) => !manifest.requiredCapabilities.includes(capability))) {
    throw refusal('ARTIFACT_CAPABILITY_DENIED');
  }
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  if (now < Date.parse(manifest.issuedAt) || now >= Date.parse(manifest.expiresAt)) {
    throw refusal('ARTIFACT_IDENTITY_EXPIRED');
  }
  const body = canonicalValue({
    schema: RECEIPT_SCHEMA,
    artifactId: manifest.artifactId,
    artifactDigest: manifest.artifactDigest,
    identityHash: fingerprint(manifest),
    scope: manifest.scope,
    admittedCapabilities: requested,
    admittedAt: new Date(now).toISOString(),
    authorizesPromotion: false
  });
  return { ...body, receiptHash: fingerprint(body) };
}

module.exports = { SCHEMA, RECEIPT_SCHEMA, sha256, issue, admit };
