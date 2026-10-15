'use strict';

const crypto = require('node:crypto');

const SCHEMA = 'genos.foraging-observation/v1';

function normalizeScope(scope) {
  if (!Array.isArray(scope) || !scope.length) throw new Error('Foraging source scope is required.');
  const origins = scope.map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Foraging source scope must contain credential-free HTTP(S) origins.');
    }
    return url.origin;
  });
  return [...new Set(origins)].sort();
}

function attestationClaims(attestation) {
  return {
    schema: SCHEMA,
    producerId: requiredString(attestation.producer_id),
    missionId: requiredString(attestation.mission_id),
    navigationScope: normalizeScope(attestation.navigation_scope),
    observedOrigin: requiredString(attestation.observed_origin),
    observedPath: normalizePath(attestation.observed_path),
    observedTextDigest: digest(attestation.observed_text_digest),
    sourcePayloadDigest: attestation.source_payload_digest === null
      ? null : digest(attestation.source_payload_digest)
  };
}

function requiredString(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    throw new Error('Foraging source attestation is incomplete.');
  }
  return value.trim();
}

function normalizePath(value) {
  const pathname = requiredString(value);
  if (!pathname.startsWith('/') || pathname.includes('?') || pathname.includes('#')) {
    throw new Error('Foraging source path is invalid.');
  }
  return pathname;
}

function digest(value) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error('Foraging source digest is invalid.');
  }
  return value;
}

function trustedKey(producerId, trustJson = process.env.GENOS_FORAGING_TRUST_JSON) {
  if (!trustJson) throw new Error('Foraging source trust is not configured.');
  let trusted;
  try { trusted = JSON.parse(trustJson); } catch (_) { throw new Error('Foraging source trust is invalid.'); }
  const pem = trusted && trusted[producerId];
  if (typeof pem !== 'string' || !pem.includes('PUBLIC KEY')) {
    throw new Error('Foraging source producer is unknown.');
  }
  return crypto.createPublicKey(pem);
}

function verifySignature(attestation, claims, trustJson) {
  const signature = attestation && attestation.signature;
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  try {
    return crypto.verify(null, Buffer.from(JSON.stringify(claims)),
      trustedKey(claims.producerId, trustJson), Buffer.from(signature, 'base64'));
  } catch (_) {
    return false;
  }
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function verifyBeforeNavigation(input) {
  const claims = attestationClaims(input.attestation);
  const target = new URL(input.targetUrl);
  const scope = normalizeScope(input.scope);
  const expectedPayloadDigest = typeof input.htmlContent === 'string' ? sha256(input.htmlContent) : null;
  const matched = claims.missionId === input.missionId
    && JSON.stringify(claims.navigationScope) === JSON.stringify(scope)
    && claims.observedOrigin === target.origin
    && claims.observedPath === target.pathname
    && claims.sourcePayloadDigest === expectedPayloadDigest;
  if (!matched || !verifySignature(input.attestation, claims, input.trustJson)) {
    throw new Error('Foraging source attestation is invalid for this mission, scope, or target.');
  }
  return claims;
}

function verifyObservation(claims, receipt) {
  const observed = receipt && receipt.observedPageScope;
  return Boolean(observed && receipt.observedTextDigest === claims.observedTextDigest
    && observed.origin === claims.observedOrigin && observed.pathname === claims.observedPath
    && JSON.stringify(normalizeScope(receipt.navigationScope)) === JSON.stringify(claims.navigationScope));
}

function bindReceipt(step, claims, signature) {
  const receipt = { ...step.receipt };
  delete receipt.evidenceRef;
  receipt.sourceProvenance = {
    schema: SCHEMA,
    producerId: claims.producerId,
    missionId: claims.missionId,
    navigationScope: claims.navigationScope,
    observedOrigin: claims.observedOrigin,
    observedPath: claims.observedPath,
    observedTextDigest: claims.observedTextDigest,
    sourcePayloadDigest: claims.sourcePayloadDigest,
    signature
  };
  receipt.evidenceRef = sha256(JSON.stringify(receipt));
  return { ...step, receipt };
}

module.exports = {
  normalizeScope,
  attestationClaims,
  verifyBeforeNavigation,
  verifyObservation,
  bindReceipt,
  sha256
};
