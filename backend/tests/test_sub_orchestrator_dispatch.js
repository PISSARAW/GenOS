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
  const originalStop = runtime.stopMission;
  const bounded = require('../src/services/agents/boundedDelegationAuthority');
  const originalBounded = { parent: bounded.parent, capacity: bounded.capacity, bind: bounded.bind };
  const state = require('../src/services/agentOrchestrationState');
  const childMethod = { version: 1, methodId: 'scoped_procedure', parameters: { procedure: { version: 1, methodId: 'subset_sum', parameters: { values: [1], target: 1 } } } };
  let startRequest;
  fleet.createAutonomousWorkers = async (_db, _parent, options) => {
    assert.equal(options.plan.dispatchWorkers[0].workerKind, 'bounded_worker');
    assert.deepEqual(options.plan.dispatchWorkers[0].methodContract, childMethod);
    assert.deepEqual(options.mission.methodContract, childMethod);
    assert.equal(options.plan.tokenPolicy.total, 2000);
    return [{ agentId: 'child-1', role: 'bounded_worker', workerKind: 'bounded_worker', workspaceId: 'ws-1', executionBudget: { tokens: 2000 } }];
  };
  runtime.startMission = async (request) => { startRequest = request; return { success: true, artifact: 'dossier' }; };
  const childContract = { identity: { workerKind: 'bounded_worker' }, evidence: { requiredArtifacts: ['dossier'] } };
  const db = { get: async (sql) => {
    if (sql.includes('COUNT(*)')) return { count: 0 };
    if (sql.includes('FROM workspaces')) return { path: 'C:/workspace' };
    if (sql.includes('FROM strategy_execution_runs')) return { id: 'child-run', status: 'completed' };
    if (sql.includes('telemetry_events')) return { payload_json: JSON.stringify({ evidenceReport: {
      outcome: 'success', claims: [{ statement: 'claim', evidence: ['source'] }],
      workerArtifact: { type: 'dossier', content: { claims: [{ statement: 'claim', evidence: ['source'] }], scopeCompletion: { scopeRef: 'Review a bounded change.', completedRefs: ['runtime:child-1'] } }, provenance: { sourceRefs: ['runtime:child-1'] } }
    } }) };
    if (sql.includes('SELECT id, status, metadata_json')) return { id: 'child-1', status: 'completed', metadata_json: JSON.stringify({ workerContract: childContract }) };
    return { id: 'sub-1', role: 'sub_orchestrator', agent_type: 'GenOS', workspace_id: 'ws-1', cognitive_budget: 5000, execution_mode: 'worker', metadata_json: metadata() };
  } };
  bounded.parent = async () => ({ agent: await db.get('parent'), contract: { limits: { maxTokens: 10000 } } });
  bounded.capacity = async () => ({ count: 0, remainingChildren: 5, remainingTokens: 10000 });
  bounded.bind = async () => ({});
  try {
    const result = await dispatchSubOrchestratorWorker(db, 'sub-1', { mission: 'Review a bounded change.', methodContract: childMethod, timeoutMs: 1234 });
    assert.equal(result.status, 'completed');
    assert.equal(result.childAgentId, 'child-1');
    assert.equal(result.supervision.success, true);
    assert.equal(result.supervision.evidenceReport.workerArtifact.type, 'dossier');
    assert.equal(startRequest.orchestratorAgentId, 'sub-1');
    assert.deepEqual(startRequest.methodContract, childMethod);
    assert.equal(startRequest.timeoutMs, 1234);
    assert.equal(startRequest.executionBudget.tokens, 2000);
    let stopped;
    runtime.startMission = async () => { state.cancelledStarts.add('sub-1'); return { success: true }; };
    runtime.stopMission = async (id) => { stopped = id; };
    const cancelled = await dispatchSubOrchestratorWorker(db, 'sub-1', { mission: 'Cancelled child', methodContract: childMethod });
    assert.equal(cancelled.success, false);
    assert.equal(cancelled.supervision.code, 'MISSION_CANCELLED');
    assert.equal(stopped, 'child-1');
  } finally {
    fleet.createAutonomousWorkers = originalCreate;
    runtime.startMission = originalStart;
    runtime.stopMission = originalStop;
    Object.assign(bounded, originalBounded);
    state.cancelledStarts.delete('sub-1');
  }
}

Promise.all([verifyCallerAuthentication(), verifyDispatchSupervision()]).then(() => {
  verifyChildBounds();
  console.log('Sub-orchestrator dispatch authenticates persisted callers and restricts child kinds and depth.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
