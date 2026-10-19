'use strict';

const assert = require('node:assert/strict');
const identity = require('../src/services/supplyChain/artifactIdentityService');

const key = 'artifact-attestation-test-key-32-bytes-minimum';
const artifactBytes = Buffer.from('immutable agent package');
const sbomBytes = Buffer.from('{"components":["agent-runtime"]}');
const scope = { organizationId: 'org-a', projectId: 'project-a', environment: 'staging' };
const issuedAt = '2026-10-19T09:00:00.000Z';
const expiresAt = '2026-10-19T09:10:00.000Z';
const manifest = identity.issue({
  artifactId: 'agent-package-1', artifactDigest: identity.sha256(artifactBytes),
  sbomDigest: identity.sha256(sbomBytes), provenance: ['build:42', 'source:commit-a'],
  requiredCapabilities: ['deploy:staging', 'registry:read'], scope,
  issuerId: 'trusted-builder', issuedAt, expiresAt
}, key);

function admission(overrides = {}) {
  return identity.admit({ manifest, artifactBytes, sbomBytes, scope,
    requestedCapabilities: ['deploy:staging'], now: Date.parse(issuedAt) + 1, ...overrides }, key);
}

const receipt = admission();
assert.equal(receipt.schema, identity.RECEIPT_SCHEMA);
assert.equal(receipt.artifactDigest, manifest.artifactDigest);
assert.equal(receipt.authorizesPromotion, false);
assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/);

assert.throws(() => admission({ artifactBytes: Buffer.from('tampered') }),
  { code: 'ARTIFACT_CONTENT_MISMATCH' });
assert.throws(() => admission({ sbomBytes: Buffer.from('tampered') }),
  { code: 'ARTIFACT_SBOM_MISMATCH' });
assert.throws(() => admission({ manifest: { ...manifest, issuerId: 'attacker' } }),
  { code: 'ARTIFACT_SIGNATURE_INVALID' });
assert.throws(() => admission({ scope: { ...scope, projectId: 'other' } }),
  { code: 'ARTIFACT_SCOPE_MISMATCH' });
assert.throws(() => admission({ requestedCapabilities: ['deploy:production'] }),
  { code: 'ARTIFACT_CAPABILITY_DENIED' });
assert.throws(() => admission({ now: Date.parse(expiresAt) }),
  { code: 'ARTIFACT_IDENTITY_EXPIRED' });
assert.throws(() => identity.issue({ ...manifest, expiresAt: issuedAt }, key),
  { code: 'ARTIFACT_LIFETIME_INVALID' });
assert.throws(() => identity.issue({ ...manifest, signature: undefined }, 'short'),
  { code: 'ARTIFACT_SIGNING_KEY_TOO_SHORT' });

console.log('Artifact identity and fail-closed admission checks passed.');
