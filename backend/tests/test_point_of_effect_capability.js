'use strict';

const assert = require('node:assert/strict');
const brokerService = require('../src/services/supplyChain/pointOfEffectCapabilityService');

const scope = { organizationId: 'org-a', projectId: 'project-a', environment: 'staging' };
const artifactDigest = `sha256:${'a'.repeat(64)}`;
const secretValue = 'runtime-token-never-returned';
let currentTime = Date.parse('2026-10-19T10:00:00.000Z');
let observedSecret;

function createBroker(adapter) {
  return brokerService.create({
    now: () => currentTime,
    secretResolver: async ({ secretRef }) => {
      assert.equal(secretRef, 'deploy-token');
      return Buffer.from(secretValue);
    },
    effectAdapters: { deploy: adapter }
  });
}

function grant(broker, overrides = {}) {
  return broker.issue({ agentId: 'agent-a', scope, action: 'deploy',
    destination: 'https://deploy.internal/v1', effectId: 'deploy', secretRef: 'deploy-token',
    artifactDigest, ttlMs: 1000, ...overrides });
}

function execution(capabilityToken, overrides = {}) {
  return { capabilityToken, agentId: 'agent-a', scope, action: 'deploy',
    destination: 'https://deploy.internal/v1', artifactDigest, payload: { releaseId: 'r1' },
    ...overrides };
}

async function main() {
  const broker = createBroker(async ({ secret, payload }) => {
    observedSecret = secret.toString('utf8');
    return { accepted: true, releaseId: payload.releaseId };
  });
  const issued = grant(broker);
  assert.equal(issued.singleUse, true);
  assert.equal(JSON.stringify(issued).includes(secretValue), false);
  const result = await broker.execute(execution(issued.capabilityToken));
  assert.equal(observedSecret, secretValue);
  assert.deepEqual(result.output, { accepted: true, releaseId: 'r1' });
  assert.equal(JSON.stringify(result).includes(secretValue), false);
  assert.equal(result.receipt.authorizesPromotion, false);
  await assert.rejects(broker.execute(execution(issued.capabilityToken)),
    { code: 'EFFECT_CAPABILITY_ALREADY_USED' });

  const mismatch = grant(broker);
  await assert.rejects(broker.execute(execution(mismatch.capabilityToken,
    { destination: 'https://attacker.invalid' })), { code: 'EFFECT_DESTINATION_MISMATCH' });
  const foreign = grant(broker);
  await assert.rejects(broker.execute(execution(foreign.capabilityToken,
    { scope: { ...scope, projectId: 'other' } })), { code: 'EFFECT_SCOPE_MISMATCH' });
  const wrongArtifact = grant(broker);
  await assert.rejects(broker.execute(execution(wrongArtifact.capabilityToken,
    { artifactDigest: `sha256:${'b'.repeat(64)}` })), { code: 'EFFECT_ARTIFACT_MISMATCH' });

  const expired = grant(broker);
  currentTime += 1000;
  await assert.rejects(broker.execute(execution(expired.capabilityToken)),
    { code: 'EFFECT_CAPABILITY_EXPIRED' });

  const leaking = createBroker(async ({ secret }) => ({ debug: secret.toString('utf8') }));
  const leakGrant = grant(leaking);
  await assert.rejects(leaking.execute(execution(leakGrant.capabilityToken)),
    { code: 'EFFECT_SECRET_EXPOSURE' });
  await assert.rejects(leaking.execute(execution(leakGrant.capabilityToken)),
    { code: 'EFFECT_CAPABILITY_ALREADY_USED' });
  assert.throws(() => grant(broker, { ttlMs: brokerService.MAX_TTL_MS + 1 }),
    { code: 'EFFECT_CAPABILITY_TTL_INVALID' });
  assert.throws(() => grant(broker, { effectId: 'unknown' }), { code: 'EFFECT_ADAPTER_UNKNOWN' });
  console.log('Point-of-effect secret capability checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
