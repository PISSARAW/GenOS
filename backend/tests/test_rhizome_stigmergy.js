'use strict';

const assert = require('node:assert/strict');
const { createSwarmMatrix } = require('../src/services/swarmStigmergyVectorService');
const trails = require('../src/services/rhizome/stigmergy/trailService');

function run() {
  const matrix = createSwarmMatrix(10000);
  const startedAt = 1000000;
  const positive = trails.deposit(matrix, 'route:verified', { amount: 10,
    kind: 'VERIFIED_RESULT', capability: 'verify', source: 'test-run', evidenceRefs: ['receipt-1'],
    confidence: 0.8, scope: 'workspace', now: startedAt
  });
  assert.equal(positive.kind, 'VERIFIED_RESULT');
  assert.equal(positive.evidenceRefs[0], 'receipt-1');
  assert.equal(positive.scope, 'workspace');
  assert.equal(positive.halfLifeMs, 18000);
  assert.equal(trails.intensity(matrix, 'route:verified', startedAt + 18000), 5);

  const evaporated = trails.evaporate(matrix, startedAt + 18000);
  assert.equal(evaporated[0].intensity, 5);
  assert.equal(trails.intensity(matrix, 'route:verified', startedAt + 36000), 2.5);

  const repellent = trails.deposit(matrix, 'route:unsafe', { amount: 7,
    kind: 'SECURITY_RISK', isRepellent: true, now: startedAt
  });
  assert.equal(repellent.intensity, -7);
  assert.equal(repellent.halfLifeMs, 40000);

  const guarded = createSwarmMatrix(10000);
  const trustNow = Date.now();
  const identityContext = { identityDigest: 'identity-a', providerId: 'provider-a' };
  trails.deposit(guarded, 'route:shared', { amount: 10, confidence: 1, identityContext, trustedIdentityDigests: ['identity-a'], now: trustNow });
  const clone = trails.deposit(guarded, 'route:shared', { amount: 10, confidence: 1,
    identityContext: { identityDigest: 'identity-a', providerId: 'provider-a' },
    trustedIdentityDigests: ['identity-a'], now: trustNow + 1
  });
  assert.ok(clone.intensity > 9.9 && clone.intensity <= 10);
  assert.equal(clone.supporters.length, 1);
  const independent = trails.deposit(guarded, 'route:shared', { amount: 10, confidence: 1,
    identityContext: { identityDigest: 'identity-b', providerId: 'provider-b' },
    trustedIdentityDigests: ['identity-b'], now: trustNow + 2
  });
  assert.ok(independent.intensity > 19.9 && independent.intensity <= 20);
  assert.equal(independent.supporters.length, 2);
  const untrusted = trails.deposit(guarded, 'route:spoofed', { amount: 50, confidence: 1,
    identityContext: { identityDigest: 'spoofed', providerId: 'provider-x' },
    trustedIdentityDigests: ['identity-a'], now: trustNow + 3
  });
  assert.equal(untrusted.intensity, 0);
}

run();
console.log('Rhizome stigmergy tests passed.');
