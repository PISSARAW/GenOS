const assert = require('node:assert/strict');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');

const mission = buildWorkerMission({ agentId: 'worker', orchestratorAgentId: 'root', prompt: 'same contract' });
assert.equal(mission.agentId, 'worker');
assert.equal(mission.orchestratorAgentId, 'root');
assert.equal(mission.autonomousOrchestration, false);
assert.equal(mission.role, 'worker');
assert.equal(mission.workerKind, 'bounded_worker');
assert.equal(mission.workerContract.identity.workerKind, 'bounded_worker');
assert.deepEqual(mission.executionBudget, {});
assert.deepEqual(mission.executionPolicy, {});
const scoped = buildWorkerMission({ agentId: 'worker', orchestratorAgentId: 'root',
  prompt: 'scoped contract', modelBudgetScope: { id: 'execution-run:root', costUsd: 1, tokens: 100 } });
assert.deepEqual(scoped.modelBudgetScope,
  { id: 'execution-run:root', costUsd: 1, tokens: 100 });
console.log('CLI and gRPC worker dispatch share one normalized mission contract.');
