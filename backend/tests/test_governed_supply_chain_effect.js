'use strict';

const assert = require('node:assert/strict');
const identity = require('../src/services/supplyChain/artifactIdentityService');
const governedEffect = require('../src/services/supplyChain/governedEffectService');

const key = 'governed-artifact-test-key-at-least-32-bytes';
const artifactBytes = Buffer.from('governed agent package');
const sbomBytes = Buffer.from('{"components":["runtime"]}');
const scope = { organizationId: 'org-a', projectId: 'project-a', environment: 'staging' };
const issuedAt = '2026-10-19T10:00:00.000Z';
let currentTime = Date.parse(issuedAt) + 1;
let effectCalls = 0;

const manifest = identity.issue({
  artifactId: 'package-1', artifactDigest: identity.sha256(artifactBytes),
  sbomDigest: identity.sha256(sbomBytes), provenance: ['build:42'],
  requiredCapabilities: ['deploy:staging'], scope, issuerId: 'builder', issuedAt,
  expiresAt: '2026-10-19T10:10:00.000Z'
}, key);

const gate = governedEffect.create({
  artifactIdentityKey: key,
  now: () => currentTime,
  secretResolver: async () => Buffer.from('deployment-secret'),
  effectAdapters: {
    deploy: async ({ secret, artifactDigest }) => {
      effectCalls += 1;
      assert.equal(secret.toString(), 'deployment-secret');
      return { accepted: true, artifactDigest };
    }
  }
});

function prepare(overrides = {}) {
  return gate.prepare({ manifest, artifactBytes, sbomBytes, scope,
    requestedCapabilities: ['deploy:staging'], now: currentTime, agentId: 'agent-a',
    action: 'deploy', destination: 'https://deploy.internal/v1', effectId: 'deploy',
    secretRef: 'deployment-token', ttlMs: 1000, ...overrides });
}

function execute(prepared, overrides = {}) {
  return gate.execute({ capabilityId: prepared.grant.capabilityId,
    capabilityToken: prepared.grant.capabilityToken,
    admissionReceiptHash: prepared.admissionReceipt.receiptHash,
    agentId: 'agent-a', scope, action: 'deploy',
    destination: 'https://deploy.internal/v1', payload: { releaseId: 'r1' },
    ...overrides });
}

async function main() {
  assert.throws(() => prepare({ artifactBytes: Buffer.from('tampered') }),
    { code: 'ARTIFACT_CONTENT_MISMATCH' });
  assert.equal(effectCalls, 0, 'invalid artifacts never receive an effect capability');

  const prepared = prepare();
  await assert.rejects(execute(prepared, { admissionReceiptHash: 'forged' }),
    { code: 'GOVERNANCE_ADMISSION_RECEIPT_MISMATCH' });
  assert.equal(effectCalls, 0);
  const result = await execute(prepared);
  assert.equal(effectCalls, 1);
  assert.equal(result.governanceReceipt.schema, governedEffect.RECEIPT_SCHEMA);
  assert.equal(result.governanceReceipt.authorizesPromotion, false);
  assert.equal(result.governanceReceipt.admissionReceiptHash,
    result.admissionReceipt.receiptHash);
  assert.equal(result.governanceReceipt.effectReceiptHash, result.effectReceipt.receiptHash);
  assert.equal(JSON.stringify(result).includes('deployment-secret'), false);
  await assert.rejects(execute(prepared), { code: 'GOVERNANCE_BINDING_UNKNOWN' });
  assert.equal(effectCalls, 1);

  const tokenSwapA = prepare();
  const tokenSwapB = prepare();
  await assert.rejects(execute(tokenSwapA,
    { capabilityToken: tokenSwapB.grant.capabilityToken }),
  { code: 'GOVERNANCE_CAPABILITY_MISMATCH' });
  const swappedRecovery = await execute(tokenSwapA);
  assert.equal(swappedRecovery.output.accepted, true);
  assert.equal(effectCalls, 2);
  console.log('Governed supply-chain effect gate checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
