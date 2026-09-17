const assert = require('node:assert/strict');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');

const mission = buildWorkerMission({ agentId: 'worker', orchestratorAgentId: 'root', prompt: 'same contract' });
assert.equal(mission.agentId, 'worker');
assert.equal(mission.orchestratorAgentId, 'root');
assert.equal(mission.autonomousOrchestration, false);
assert.equal(mission.role, 'worker');
assert.deepEqual(mission.executionBudget, {});
assert.deepEqual(mission.executionPolicy, {});
console.log('CLI and gRPC worker dispatch share one normalized mission contract.');
