'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { buildActionContext } = require('../bin/orchestratorActionContext.cjs');
const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');

const context = buildActionContext({
  db: null, action: 'dispatch_biological', orchestratorId: 'orch-1',
  request: { executor: 'local' }, task: 'Validate JSON', id: 'orch-1'
});
assert.equal(context.bridgePath, path.resolve(__dirname, '../bin/genos-orchestrate.cjs'));

const worker = workerLaunchPayload({
  context: { ...context, request: { ...context.request, mode: 'syncytium' }, topologySession: { sessionId: 'syncytium:assignment:1', revision: 2 } },
  member: { role: 'verifier', mission: 'Validate JSON', engine: 'local' },
  workerId: 'worker-1', parent: { workspace_root: '/workspace' }
});
assert.equal(worker.action, 'dispatch_worker');
assert.equal(worker.workerId, 'worker-1');
assert.equal(worker.reuseWorkerId, 'worker-1');
assert.equal(worker.reuseChecked, true);
assert.equal(worker.executor, 'local');
assert.equal(worker.localRuntime, true);
assert.equal(worker.topologySessionId, 'syncytium:assignment:1');
assert.ok(worker.mission.includes('SYNCYTIUM RE-GROUNDING'));
assert.ok(worker.mission.includes('operation "events"'));

for (const mode of ['biome', 'rhizome', 'metapopulation']) {
  const otherTopology = workerLaunchPayload({
    context: { ...context, request: { ...context.request, mode }, topologySession: { sessionId: `${mode}:assignment:1`, revision: 2 } },
    member: { role: 'analyst', mission: 'Inspect the active topology.' },
    workerId: `${mode}-worker`, parent: { workspace_root: '/workspace' }
  });
  assert.ok(!otherTopology.mission.includes('SYNCYTIUM RE-GROUNDING'), `${mode} must not receive Syncytium event instructions`);
  assert.ok(!otherTopology.mission.includes('operation "events"'), `${mode} does not support Syncytium event operation`);
}

const scopedWorker = workerLaunchPayload({
  context: { ...context, trinityModelBudgetScope: { id: 'execution-run:parent-run', costUsd: 1, tokens: 6000 } },
  member: { role: 'analyst', mission: 'Analyze evidence' },
  workerId: 'scoped-worker', parent: { workspace_root: '/workspace' }
});
assert.deepEqual(scopedWorker.modelBudgetScope,
  { id: 'execution-run:parent-run', costUsd: 1, tokens: 6000 });

const populationContext = {
  ...context,
  request: { ...context.request, mode: 'metapopulation' },
  nceEnrichments: { topology: 'unrelated learned examples' }
};
const populationWorker = workerLaunchPayload({
  context: populationContext,
  member: { role: 'quorum_sensor', workerKind: 'scout_cell', mission: 'A=1, B=1. Preserve these exact inputs.', engine: 'cloud' },
  workerId: 'population-worker', parent: { workspace_root: '/workspace' }
});
assert.ok(populationWorker.mission.includes('A=1, B=1. Preserve these exact inputs.'));
assert.ok(populationWorker.mission.includes('METAPOPULATION MIGRATION CONTRACT'));

const baselineWorker = workerLaunchPayload({
  context: { ...context, request: { ...context.request, mode: 'isolated_baseline' } },
  member: { role: 'verifier', mission: 'Independent baseline', engine: 'cloud' },
  workerId: 'baseline-worker', parent: { workspace_root: '/workspace' },
  toolLease: ['genos_snapshot', 'genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session', 'genos_change_organization']
});
assert.ok(baselineWorker.mission.includes('ISOLATED BASELINE'));
assert.deepEqual(baselineWorker.toolLease, ['genos_snapshot']);

const trinityWorker = workerLaunchPayload({
  context: { ...context, request: { ...context.request, mode: 'trinity',
    coordinationPolicy: { communicationCadence: 'continuous_sync' } } },
  member: { role: 'verifier', mission: 'Independent Trinity world', engine: 'cloud' },
  workerId: 'trinity-worker', parent: { workspace_root: '/workspace' },
  toolLease: ['genos_snapshot', 'genos_worker_publish', 'genos_worker_inbox']
});
assert.deepEqual(trinityWorker.toolLease, ['genos_snapshot']);
assert.equal(trinityWorker.coordinationPolicy.isolated, true);
assert.equal(trinityWorker.coordinationPolicy.communicationCadence, 'isolated');

const localModelWorker = workerLaunchPayload({
  context: { ...context, request: { ...context.request, executor: undefined, localModel: 'ollama://qwen2.5-coder:7b' } },
  member: { role: 'analyst', mission: 'Analyze evidence', engine: 'cloud' },
  workerId: 'local-model-worker', parent: { workspace_root: '/workspace' }
});
assert.equal(localModelWorker.executor, 'local');
assert.equal(localModelWorker.localRuntime, true);
assert.equal(localModelWorker.localModel, 'ollama://qwen2.5-coder:7b');
assert.equal(localModelWorker.localRoutingPolicy.primary, 'ollama://qwen2.5-coder:7b');

const requestedWorkspace = path.resolve('requested-workspace');
const camelWorkspaceWorker = workerLaunchPayload({
  context: { ...context, request: { workspaceRoot: requestedWorkspace } },
  member: { role: 'analyst', mission: 'Use the requested workspace' },
  workerId: 'camel-workspace-worker', parent: { workspace_root: '.' }
});
assert.equal(camelWorkspaceWorker.workspace_root, requestedWorkspace);

const inheritedWorkspaceWorker = workerLaunchPayload({
  context: { ...context, request: {} },
  member: { role: 'analyst', mission: 'Use the inherited workspace' },
  workerId: 'inherited-workspace-worker', parent: { workspace_root: '.' }
});
assert.equal(inheritedWorkspaceWorker.workspace_root, process.cwd());

console.log('Topology worker launch payload: PASS');

const budget = { tokens: 6000, costUsd: 1, latencyMs: 60000, events: 30 };
assert.deepEqual(require('../bin/workerLaunchPayload.cjs').selectedBudget({ executionBudgetTokens: 20000 }, {}),
  { tokens: 20000 }, 'A token-only allocation must survive without a parent budget.');
const missionScope = { available: true, episodeId: 'episode-1', rootThreadId: 'thread-1' };
for (const field of ['executionBudget', 'execution_budget']) {
  const launch = workerLaunchPayload({ context: { request: { [field]: budget, missionScope } },
    member: { executionBudget: { tokens: 1500, costUsd: 0.25 }, role: 'analyst' },
    workerId: 'budget-worker', parent: {} });
  assert.deepEqual(launch.execution_budget, { ...budget, tokens: 1500, costUsd: 0.25 });
  assert.deepEqual(launch.missionScope, missionScope);
  assert.equal(launch.localRuntime, undefined);
}
const { childBudget } = require('../bin/directWorkerBudgetScope.cjs');
assert.deepEqual(childBudget({ executionBudget: budget, workerTokenLimit: 1500 }), { ...budget, tokens: 1500 });
assert.throws(() => childBudget({ executionBudget: budget, workerTokenLimit: 7000 }), { code: 'WORKER_BUDGET_INVALID' });
assert.throws(() => childBudget({ executionBudget: { ...budget, tokens: NaN } }), { code: 'WORKER_BUDGET_INVALID' });
const codeProof = require('../src/services/agents/workerArtifactCodeProof');
for (const statement of ['L’équation de Babel-Gödel est résolue avec succès.',
  'Le résultat mathématique est correct : N = 10805.', 'The calculated equilibrium is stable.']) {
  assert.equal(codeProof.statesCodeSuccess(statement), false, statement);
}
for (const statement of ['Le bug est résolu.', 'Le service est stable.', 'Correctif appliqué.', 'Tests pass.']) {
  assert.equal(codeProof.statesCodeSuccess(statement), true, statement);
}
const windowsBudget = require('../src/services/missionProtocols/windowsBudget');
assert.deepEqual(windowsBudget.validate(budget), budget);
for (const invalid of [{ ...budget, tokens: -1 }, { ...budget, costUsd: NaN }, { ...budget, latencyMs: 0 }, {}]) {
  assert.throws(() => windowsBudget.validate(invalid), /WINDOWS_PROTOCOL_BUDGET_INVALID/);
}
const { allocate } = require('../src/services/topology/biomeDispatchBudget.cjs');
assert.throws(() => allocate({ members: [{}, {}, {}, {}] }, { executionBudget: { ...budget, tokens: 3 } }),
  { code: 'BIOME_DISPATCH_BUDGET_INSUFFICIENT' });
