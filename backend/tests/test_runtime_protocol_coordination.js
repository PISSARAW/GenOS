'use strict';

const assert = require('node:assert/strict');
const { encodeMission, decodeMission } = require('../src/services/runtimeProtocol');
const envelope = require('../src/services/agentMissionEnvelopeService');

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

  const built = envelope.build({
    normalizedMission: { organization: 'cross_functional_pod', coordinationPolicy },
    workspaceRoot: process.cwd(), dispatchedAgent: { execution_mode: 'worker' },
    runtimeBudget: {}, autonomyPlan: {}, genosCapsule: {}
  }, { agentId: 'worker-envelope-test' }, {});
  const envelopeDecoded = decodeMission(encodeMission(built));
  assert.equal(envelopeDecoded.organization, 'cross_functional_pod');
  assert.deepEqual(envelopeDecoded.coordinationPolicy, coordinationPolicy);
  console.log('Runtime coordination protocol regression passed.');
}

run();
