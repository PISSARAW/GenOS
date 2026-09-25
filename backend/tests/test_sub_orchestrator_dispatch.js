'use strict';

const assert = require('node:assert/strict');
const { dispatchSubOrchestratorWorker, loadAuthorizedParent, childAssignment, MAX_CHILDREN } = require('../src/services/agents/subOrchestratorDispatchService');

function metadata(workerKind = 'sub_orchestrator') {
  return JSON.stringify({ workerKind, workerContract: {
    identity: { workerKind }, authority: { spawn: true, delegate: true },
    spawnBudget: MAX_CHILDREN, delegationDepth: 1, delegationExpiresAt: Date.now() + 60000
  } });
}

async function verifyCallerAuthentication() {
  const db = { get: async () => ({ id: 'sub-1', execution_mode: 'worker', metadata_json: metadata() }) };
  assert.equal((await loadAuthorizedParent(db, 'sub-1')).id, 'sub-1');
  await assert.rejects(() => loadAuthorizedParent({ get: async () => ({ id: 'worker', execution_mode: 'worker', metadata_json: metadata('bounded_worker') }) }, 'worker'), { code: 'WORKER_CONTRACT_DENIED' });
  await assert.rejects(() => loadAuthorizedParent({ get: async () => ({ id: 'orchestrator', execution_mode: 'orchestrator', metadata_json: metadata() }) }, 'orchestrator'), { code: 'WORKER_CONTRACT_DENIED' });
}

function verifyChildBounds() {
  assert.deepEqual(childAssignment({ mission: 'Review this change.' }), {
    role: 'bounded_worker', workerKind: 'bounded_worker', label: 'delegated-bounded_worker',
    hypothesis: 'Complete the scoped subtask and return contract evidence.', capabilities: []
  });
  assert.throws(() => childAssignment({ workerKind: 'sub_orchestrator' }), { code: 'SUBORCHESTRATOR_CHILD_KIND_DENIED' });
  assert.throws(() => childAssignment({ workerKind: 'formal_worker' }), { code: 'SUBORCHESTRATOR_CHILD_KIND_DENIED' });
}

async function verifyDispatchSupervision() {
  const fleet = require('../src/services/agentFleetWorkers');
  const runtime = require('../src/services/agentRuntimeAdapter');
  const originalCreate = fleet.createAutonomousWorkers;
  const originalStart = runtime.startMission;
  let startRequest;
  fleet.createAutonomousWorkers = async (_db, _parent, options) => {
    assert.equal(options.plan.dispatchWorkers[0].workerKind, 'bounded_worker');
    assert.equal(options.plan.tokenPolicy.total, 5000);
    return [{ agentId: 'child-1', role: 'bounded_worker', workerKind: 'bounded_worker', workspaceId: 'ws-1', executionBudget: { tokens: 5000 } }];
  };
  runtime.startMission = async (request) => { startRequest = request; return { success: true, artifact: 'dossier' }; };
  const db = { get: async (sql) => {
    if (sql.includes('COUNT(*)')) return { count: 0 };
    if (sql.includes('FROM workspaces')) return { path: 'C:/workspace' };
    return { id: 'sub-1', role: 'sub_orchestrator', agent_type: 'GenOS', workspace_id: 'ws-1', cognitive_budget: 5000, execution_mode: 'worker', metadata_json: metadata() };
  } };
  try {
    const result = await dispatchSubOrchestratorWorker(db, 'sub-1', { mission: 'Review a bounded change.' });
    assert.equal(result.status, 'completed');
    assert.equal(result.childAgentId, 'child-1');
    assert.equal(result.supervision.result.artifact, 'dossier');
    assert.equal(startRequest.orchestratorAgentId, 'sub-1');
    assert.equal(startRequest.executionBudget.tokens, 5000);
  } finally {
    fleet.createAutonomousWorkers = originalCreate;
    runtime.startMission = originalStart;
  }
}

Promise.all([verifyCallerAuthentication(), verifyDispatchSupervision()]).then(() => {
  verifyChildBounds();
  console.log('Sub-orchestrator dispatch authenticates persisted callers and restricts child kinds and depth.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
