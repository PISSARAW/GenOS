'use strict';

const assert = require('node:assert/strict');
const authority = require('../../src/services/missionEnvelopeAuthority');
const WORKER_TIMEOUT_MS = 180000;

async function create(db, method) {
  const parent = await db.get("SELECT * FROM agents WHERE id='delegation-root'");
  assert.equal(parent.execution_mode, 'orchestrator');
  const control = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', parent.id);
  const sealed = await authority.assertRun(db, { agentId: parent.id, runId: control.id });
  assert.equal(sealed.envelope.limits.latencyMs, 300000);
  const workspace = await db.get('SELECT path FROM workspaces WHERE id=?', parent.workspace_id);
  const mission = { missionId: sealed.envelope.missionId, prompt: 'Verify the recorded code against the bounded contract',
    timeoutMs: WORKER_TIMEOUT_MS, workspaceRoot: workspace.path, workspaceProvisioned: true,
    executor: 'local', executionPolicy: { allowFileEdits: false },
    executionBudget: { tokens: 12000, events: 100, costUsd: 1, latencyMs: WORKER_TIMEOUT_MS } };
  const plan = { strategyContract: { primary: 'tree-search' },
    tokenPolicy: { total: 12000, workerShare: 1, orchestratorReserve: 0 },
    dispatchWorkers: [{ workerKind: 'verifier_worker', role: 'verifier_worker', methodContract: method,
      label: 'native-code-proof', hypothesis: 'Check the prescribed artifact and postconditions.' }] };
  const workers = await require('../../src/services/agentFleetWorkers').createAutonomousWorkers(db, parent, { mission, plan });
  assert.equal(workers.length, 1);
  const child = workers[0];
  await require('../../src/services/missionIdentityService').attachAgent(db, {
    missionId: mission.missionId, agentId: child.agentId, role: child.role });
  return { child, mission, parent, control, sealed };
}

async function dispatch(db, method) {
  let context, failure;
  try {
    context = await create(db, method);
    const { child, mission, parent } = context;
    await require('../../src/services/agentRuntimeAdapter').startMission({ ...mission,
      agentId: child.agentId, role: child.role, workerKind: child.workerKind, methodContract: method,
      prompt: child.prompt, workerContract: child.workerContract, orchestratorAgentId: parent.id,
      workspaceId: child.workspaceId, workspaceRoot: child.workspaceRoot });
    const current = await authority.assertRun(db, { agentId: parent.id, runId: context.control.id });
    assert.equal(current.hash, context.sealed.hash);
  } catch (error) { failure = error; }
  const childAgentId = context?.child.agentId;
  const row = childAgentId && await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', childAgentId);
  const saved = row && await authority.read(db, row.id);
  return { result: { childAgentId, success: row?.status === 'completed',
    transport: 'sealed-root-native-worker', supervision: { status: row?.status,
      ...(failure ? { error: { code: failure.code, message: failure.message } } : {}) } },
    row, authority: saved, request: row && { runId: row.id, agentId: row.agent_id, scope: saved.envelope.scope } };
}

module.exports = { dispatch, WORKER_TIMEOUT_MS };
