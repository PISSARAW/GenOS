const assert = require('node:assert/strict');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const { buildWorkerContract } = require('../bin/orchestratorActions.cjs');

const mission = buildWorkerMission({ agentId: 'worker', orchestratorAgentId: 'root', prompt: 'same contract' });
assert.equal(mission.agentId, 'worker');
assert.equal(mission.orchestratorAgentId, 'root');
assert.equal(mission.autonomousOrchestration, false);
assert.equal(mission.role, 'worker');
assert.equal(mission.workerKind, 'bounded_worker');
assert.equal(mission.workerContract.identity.workerKind, 'bounded_worker');
assert.deepEqual(mission.executionBudget, {});
assert.deepEqual(mission.executionPolicy, {});
const coordinatedMission = buildWorkerMission({ agentId: 'worker-coordinated', orchestratorAgentId: 'root',
  prompt: 'coordinate worker findings', communicationRequired: true,
  executionBudget: { tokens: 60000 } });
assert.equal(coordinatedMission.workerContract.mission.communicationRequired, true);
assert.equal(coordinatedMission.workerContract.resources.maxTokens, 40000);
const scoped = buildWorkerMission({ agentId: 'worker', orchestratorAgentId: 'root',
  prompt: 'scoped contract', modelBudgetScope: { id: 'execution-run:root', costUsd: 1, tokens: 100 } });
assert.deepEqual(scoped.modelBudgetScope,
  { id: 'execution-run:root', costUsd: 1, tokens: 100 });
const persistedContract = buildWorkerContract({
  workerKinds: require('../src/services/agents/workerKindService'),
  workerKind: 'bounded_worker',
  context: { task: 'diagnose latency', orchestratorId: 'root' },
  request: { execution_budget: { tokens: 20000 } }
});
assert.equal(persistedContract.resources.maxTokens, 20000);
const coordinatedQuality = buildWorkerContract({
  workerKinds: require('../src/services/agents/workerKindService'),
  workerKind: 'bounded_worker',
  context: { task: 'fix booking validation', orchestratorId: 'root' },
  request: { communicationRequired: true, execution_budget: { tokens: 40000 } }
});
assert.equal(coordinatedQuality.mission.communicationRequired, true);
assert.equal(coordinatedQuality.resources.maxTokens, 40000);
const coordinatedForensic = buildWorkerContract({
  workerKinds: require('../src/services/agents/workerKindService'),
  workerKind: 'forensic_worker',
  context: { task: 'map peers', orchestratorId: 'root' },
  request: { coordinationPolicy: { communicationCadence: 'continuous_sync' } }
});
assert.equal(coordinatedForensic.authority.communicate, true);
assert.equal(coordinatedForensic.mission.communicationRequired, true);
console.log('CLI and gRPC worker dispatch share one normalized mission contract.');
