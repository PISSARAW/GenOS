'use strict';

const assert = require('node:assert/strict');
const { runContinuousIntegration } = require('../src/services/aTeam/integration/continuousIntegrationService');

const ready = runContinuousIntegration({
  aTeam: { members: [], runtimeHandoffs: [], workGraph: {
    workGraphId: 'graph-1', teamRunId: 'run-1', nodes: [{ nodeId: 'n1', responsibility: 'api', requiredCapabilities: ['backend'], inputs: [], outputs: [], preconditions: [], postconditions: [], risk: 'low', criticality: 'low', status: 'READY' }], edges: []
  } }
});
assert.equal(ready.readyToIntegrate, true);
assert.equal(ready.integrationGraphHealth.valid, true);

const blocked = runContinuousIntegration({ aTeam: {
  members: [],
  runtimeHandoffs: [{ handoffId: 'h-1', blocking: true, status: 'REJECT', accepted: false }],
  workGraph: { workGraphId: 'graph-bad', nodes: [], edges: [] },
  capabilityCoverage: {
    missionCoverage: { ratio: 1 }, staffedCoverage: { ratio: 1 },
    runtimeToolCoverage: { ratio: 0 }, verifiedCoverage: { ratio: 0 }, uncovered: ['security']
  }
} });
assert.equal(blocked.readyToIntegrate, false);
assert.equal(blocked.integrationGraphHealth.valid, false);
assert.equal(blocked.unresolvedContracts.length, 1);
assert.deepEqual(blocked.uncoveredCapabilities, ['security']);
assert.equal(blocked.blockingFailures.length, 3);
console.log('A-Team continuous integration gate: OK');
