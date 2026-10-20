'use strict';

const assert = require('node:assert/strict');
const { preflightHolobiontMission } = require('../src/services/holobionte/runtime/holobiontMissionService');
const policy = require('../src/services/holobionte/runtime/capabilityExecutionPolicy');

function baseInput() {
  const executeCapability = async () => ({ result: { ok: true } });
  const verifyCapability = async () => ({ status: 'VERIFIED', resultHash: 'hash', verifierId: 'verifier', evidenceRefs: ['proof'] });
  return {
    hostId: 'host-1',
    missionId: 'mission-1',
    capability: 'review',
    allocation: { policy: { tokens: 10 }, available: { tokens: 10 } },
    executeCapability,
    verifyCapability
  };
}

const missing = preflightHolobiontMission({ hostId: 'host-1', missionId: 'mission-1', capability: 'review', allocation: { policy: { tokens: 10 }, available: { tokens: 10 } } });
assert.equal(missing.ready, false);
assert.equal(missing.code, 'HOLOBIONT_EXECUTOR_REQUIRED');

const missingVerifier = preflightHolobiontMission({ ...baseInput(), verifyCapability: undefined });
assert.equal(missingVerifier.ready, false);
assert.equal(missingVerifier.code, 'HOLOBIONT_VERIFIER_REQUIRED');

const invalidExecutor = preflightHolobiontMission({ ...baseInput(), executeCapability: 'configured' });
assert.equal(invalidExecutor.ready, false);
assert.equal(invalidExecutor.code, 'HOLOBIONT_EXECUTOR_REQUIRED');

const invalidTrial = preflightHolobiontMission({ ...baseInput(), trialCapabilityExecutor: 'configured' });
assert.equal(invalidTrial.ready, false);
assert.equal(invalidTrial.code, 'HOLOBIONT_TRIAL_EXECUTOR_REQUIRED');

const sameFunction = async () => ({ result: { ok: true } });
const same = preflightHolobiontMission({ ...baseInput(), executeCapability: sameFunction, verifyCapability: sameFunction });
assert.equal(same.ready, false);
assert.equal(same.code, 'HOLOBIONT_VERIFIER_NOT_INDEPENDENT');

const clonedImplementation = () => ({ result: { ok: true } });
const cloned = preflightHolobiontMission({ ...baseInput(),
  executeCapability: () => ({ result: { ok: true } }), verifyCapability: clonedImplementation });
assert.equal(cloned.ready, false);
assert.equal(cloned.code, 'HOLOBIONT_VERIFIER_NOT_INDEPENDENT');

const ready = preflightHolobiontMission(baseInput());
assert.equal(ready.ready, true);

const proof = policy.assertAdapters(baseInput());
assert.equal(proof.schema, policy.ADAPTER_PROVENANCE_SCHEMA);
assert.match(proof.executor.implementationHash, /^sha256:[a-f0-9]{64}$/);
assert.match(proof.verifier.proofHash, /^sha256:[a-f0-9]{64}$/);

console.log('Holobionte adapter guards: PASS');
