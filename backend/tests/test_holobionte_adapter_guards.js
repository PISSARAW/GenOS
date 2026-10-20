'use strict';

const assert = require('node:assert/strict');
const { preflightHolobiontMission } = require('../src/services/holobionte/runtime/holobiontMissionService');

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
assert.equal(missing.code, 'HOLOBIONT_ADAPTERS_REQUIRED');

const sameFunction = async () => ({ result: { ok: true } });
const same = preflightHolobiontMission({ ...baseInput(), executeCapability: sameFunction, verifyCapability: sameFunction });
assert.equal(same.ready, false);
assert.equal(same.code, 'HOLOBIONT_VERIFIER_NOT_INDEPENDENT');

const ready = preflightHolobiontMission(baseInput());
assert.equal(ready.ready, true);

console.log('Holobionte adapter guards: PASS');