'use strict';

const assert = require('node:assert/strict');
const { encodeMission, decodeMission } = require('../src/services/runtimeProtocol');

function run() {
  const coordinationPolicy = {
    variant: 'cross_functional_pod',
    communicationCadence: 'continuous_sync',
    sharedState: true
  };
  const decoded = decodeMission(encodeMission({
    agentId: 'worker-protocol-test',
    organization: 'cross_functional_pod',
    coordinationPolicy
  }));

  assert.equal(decoded.organization, 'cross_functional_pod');
  assert.deepEqual(decoded.coordinationPolicy, coordinationPolicy);
  assert.equal(decoded.coordinationPolicyJson, JSON.stringify(coordinationPolicy));
  console.log('Runtime coordination protocol regression passed.');
}

run();
