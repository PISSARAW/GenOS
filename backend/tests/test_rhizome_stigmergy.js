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
}

run();
console.log('Rhizome stigmergy tests passed.');
