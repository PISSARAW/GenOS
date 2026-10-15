'use strict';

const assert = require('node:assert/strict');
const { getRecoveryOrganization } = require('../src/services/agentRecovery/queueWorkerRecovery');

assert.equal(getRecoveryOrganization('mutate_worker', {}), 'isolated_recovery');
assert.equal(getRecoveryOrganization('fork_worker', {}), 'competitive_arena');
assert.equal(getRecoveryOrganization('mutate_worker', {
  communicationRequired: true
}), null);
assert.equal(getRecoveryOrganization('fork_worker', {
  organization: 'cross_functional_pod'
}), null);
assert.equal(getRecoveryOrganization('bisect_and_rollback', {
  coordinationPolicy: { communicationCadence: 'continuous_sync' }
}), null);

console.log('Coordinated worker recovery topology: PASS');
