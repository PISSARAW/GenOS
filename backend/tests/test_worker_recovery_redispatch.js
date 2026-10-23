const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const orchestrationState = require('../src/services/agentOrchestrationState');
const workerGarage = require('../src/services/workerGarageService');

const DB_PATH = path.resolve(__dirname, 'worker-recovery-redispatch-test.db');
const emitted = [];
const startedMissions = [];
const recoveryCalls = [];
const continuationCalls = [];
let recoveryWorkspaceCalls = 0;

orchestrationState.emit = (...args) => { emitted.push(args); return { id: 'test-event' }; };

const lifecycle = require('../src/services/agentWorkspaceLifecycleService');
lifecycle.createIsolatedWorkspace = async () => {
  recoveryWorkspaceCalls += 1;
  return '/tmp/genos-recovery-redispatch-ws';
};
lifecycle.cleanupWorkspace = async () => 'removed';
lifecycle.forgetWorkspace = async () => true;

const adapter = require('../src/services/agentRuntimeAdapter');
adapter.startMission = async (mission) => { startedMissions.push(mission); return { started: true }; };

const recoveryService = require('../src/services/agentRecoveryService');
recoveryService.dispatchWorkerRecovery = async (agentId) => { recoveryCalls.push(agentId); return true; };

const roundService = require('../src/services/agentRoundService');
roundService.dispatchPendingContinuation = (agentId) => { continuationCalls.push(agentId); };

const { dispatchWorkerRecovery, MAX_RECOVERY_DISPATCH_ATTEMPTS } = require('../src/services/agentRecovery/dispatchWorkerRecovery');
const { queueWorkerRecovery } = require('../src/services/agentRecovery/queueWorkerRecovery');
const workerRecovery = require('../src/services/workerFailureRecoveryService');
const missionExecution = require('../src/services/agentRuntimeAdapter/missionExecution');

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function baseMission(agentId, overrides = {}) {
  return {
    agentId, orchestratorAgentId: 'rec-orch', prompt: 'Prove property P',
    workspaceRoot: __dirname, executionBudget: { tokens: 1000 },
    recoveryAttempt: 0, recoveryMaxAttempts: 3,
    resumeCheckpointId: 'ckpt-1', snapshots: [{ id: 'snap-1' }],
    modelBudgetScope: { id: 'scope-1', costUsd: 1, tokens: 1000 },
    ...overrides
  };
}

function failureEvent(category) {
  return {
    eventType: 'WORKER_TASK_FAILED', detail: 'runtime worker process killed',
    payload: { failure: { category, reason: 'process killed', evidence: [] } }
  };
}

function queuedRecovery(agentId, category, missionOverrides = {}) {
  const mission = baseMission(agentId, missionOverrides);
  const report = workerRecovery.failureReport(failureEvent(category), mission);
  const decision = workerRecovery.decideRecovery(report);
  return { mission, report, decision };
}

async function setup(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('rec-org', 'Rec Org')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('rec-project', 'rec-org', 'Rec Project')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('rec-ws', 'Rec WS', ?, 'rec-org', 'rec-project')", __dirname);
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('rec-ws-other', 'Rec Other WS', ?, 'rec-org', 'rec-project')", path.join(__dirname, 'fixtures'));
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('rec-orch', 'Orch', 'orchestrator', 'running', 'orchestrator', 'rec-ws')");
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('rec-orch-other', 'Other Orch', 'orchestrator', 'running', 'orchestrator', 'rec-ws-other')");
  const workers = [['rec-w', 'error'], ['rec-w2', 'error'], ['rec-done', 'completed'], ['rec-fail', 'error'], ['rec-f1', 'running']];
  for (const [id, status] of workers) {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES (?, ?, 'implementation', ?, 'worker', 'rec-orch')", id, id, status);
  }
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('rec-w-trinity', 'Trinity Worker', 'implementation', 'error', 'worker', 'rec-ws', 'rec-orch-other')");
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('rec-w-cross', 'Cross Workspace Worker', 'implementation', 'error', 'worker', 'rec-ws', 'rec-orch-other')");
  const claims = [['req-rec', 'rec-w'], ['req-rec2', 'rec-w2'], ['req-recf', 'rec-fail']];
  for (const [requestId, workerId] of claims) {
    await db.run(
      `INSERT INTO garage_queue (request_id, orchestrator_id, worker_id, mode, status, phase, request_json, lease_id, lease_expires_at, deadline_at)
       VALUES (?, 'rec-orch', ?, 'surface', 'claimed', 'ready', '{}', ?, ?, ?)`,
      requestId, workerId, `lease-${requestId}`, iso(60000), iso(3600000)
    );
  }
}

async function openClaims(db, workerId) {
  const row = await db.get("SELECT COUNT(*) AS count FROM garage_queue WHERE worker_id = ? AND status IN ('queued','claimed','running')", workerId);
  return row.count;
}

function clearSharedState() {
  emitted.length = 0;
  startedMissions.length = 0;
  recoveryCalls.length = 0;
  continuationCalls.length = 0;
  orchestrationState.pendingWorkerRecoveries.clear();
  orchestrationState.activeWorkerRecoveryDispatches.clear();
  orchestrationState.pendingContinuations.clear();
}

async function checkSameIdentityRedispatch(db) {
  const { mission, report, decision } = queuedRecovery('rec-w', 'unresolved_task', {
    garageRequestId: 'garage-previous', garageLeaseId: 'lease-previous'
  });
  assert.equal(decision.identity, 'same');
  orchestrationState.pendingWorkerRecoveries.set('rec-w', { mission, report, decision });
  assert.equal(await dispatchWorkerRecovery('rec-w'), true, 'recovery of a killed worker must dispatch');
  assert.equal(startedMissions.length, 1, 'exactly one recovery mission starts, no duplicate promotion');
  const dispatched = startedMissions[0];
  assert.equal(dispatched.garageRequestId, undefined, 'recovery must not reuse the failed garage request');
  assert.equal(dispatched.garageLeaseId, undefined, 'recovery must acquire a fresh garage lease');
  assert.equal(dispatched.resumeCheckpointId, 'ckpt-1', 'the checkpoint reference is resumed');
  assert.deepEqual(dispatched.snapshots, [{ id: 'snap-1' }]);
  assert.deepEqual(dispatched.modelBudgetScope, { id: 'scope-1', costUsd: 1, tokens: 1000 }, 'the budget scope is consumed as-is');
  assert.equal((await db.get("SELECT status FROM agents WHERE id = 'rec-w'")).status, 'running');
  assert.equal(await openClaims(db, 'rec-w'), 0, 'no duplicate open claim remains');
}

async function checkReplacementRedispatch(db) {
  const { mission, report, decision } = queuedRecovery('rec-w2', 'capability_mismatch');
  assert.equal(decision.identity, 'new');
  orchestrationState.pendingWorkerRecoveries.set('rec-w2', { mission, report, decision });
  const before = (await db.get("SELECT COUNT(*) AS count FROM agents WHERE parent_agent_id = 'rec-orch'")).count;
  assert.equal(await dispatchWorkerRecovery('rec-w2'), true, 'a replacement worker must dispatch');
  const after = (await db.get("SELECT COUNT(*) AS count FROM agents WHERE parent_agent_id = 'rec-orch'")).count;
  assert.equal(after, before + 1, 'exactly one replacement worker is created');
  const dispatched = startedMissions[startedMissions.length - 1];
  assert.notEqual(dispatched.agentId, 'rec-w2');
  assert.equal(dispatched.resumeCheckpointId, 'ckpt-1', 'the replacement resumes the checkpoint');
  assert.equal((await db.get("SELECT status FROM agents WHERE id = 'rec-w2'")).status, 'error', 'the dead source is left untouched');
}

async function checkTrinityRecoveryKeepsSealedWorkspace(db) {
  clearSharedState();
  const before = recoveryWorkspaceCalls;
  const { mission, report, decision } = queuedRecovery('rec-w-trinity', 'unresolved_task', {
    missionScope: { trinityExperimentId: 'rec-trinity-experiment' },
    workspaceRoot: __dirname,
    workspaceId: 'rec-ws'
  });
  assert.equal(decision.identity, 'same');
  orchestrationState.pendingWorkerRecoveries.set('rec-w-trinity', { mission, report, decision });
  const reserveSlot = workerGarage.reserveSlot;
  workerGarage.reserveSlot = async () => ({ slot: 1, capacity: 8 });
  try {
    assert.equal(await dispatchWorkerRecovery('rec-w-trinity'), true, JSON.stringify(emitted.slice(-4)));
  } finally {
    workerGarage.reserveSlot = reserveSlot;
  }
  assert.equal(startedMissions.at(-1).workspaceRoot, __dirname,
    'Trinity recovery must keep the workspace root sealed to the source worker');
  assert.equal(recoveryWorkspaceCalls, before, 'Trinity recovery must not clone a differently bound workspace');
}

async function checkRecoveryLineageUsesWorkspaceParent(db) {
  clearSharedState();
  const { mission, report, decision } = queuedRecovery('rec-w-cross', 'capability_mismatch');
  assert.equal(decision.identity, 'new');
  orchestrationState.pendingWorkerRecoveries.set('rec-w-cross', { mission, report, decision });
  assert.equal(await dispatchWorkerRecovery('rec-w-cross'), true,
    'replacement recovery must pass the parent garage workspace check while preserving worker lineage');
  const dispatched = startedMissions.at(-1);
  const recoveredAgent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', dispatched.agentId);
  assert.equal(recoveredAgent.workspace_id, 'rec-ws-other',
    'replacement recovery must bind its garage identity to the parent domain workspace');
  const edge = await db.get('SELECT workspace_id, source_node_id, target_node_id FROM lineage_edges WHERE target_node_id = ?', dispatched.agentId);
  assert.deepEqual(edge, { workspace_id: 'rec-ws', source_node_id: 'rec-w-cross', target_node_id: dispatched.agentId },
    'recovery lineage must point to the failed worker in the same workspace');
}

async function checkValidatedWorkNotRedispatched(db) {
  clearSharedState();
  const { mission, report, decision } = queuedRecovery('rec-done', 'unresolved_task');
  orchestrationState.pendingWorkerRecoveries.set('rec-done', { mission, report, decision });
  assert.equal(await dispatchWorkerRecovery('rec-done'), false, 'validated completed work must not be re-dispatched');
  assert.equal(startedMissions.length, 0, 'no replacement is promoted for validated work');
  assert.equal((await db.get("SELECT status FROM agents WHERE id = 'rec-done'")).status, 'completed');
  assert.ok(emitted.some((args) => args[1] === 'WORKER_RECOVERY_REDUNDANT'), 'a redundant-recovery verdict is emitted');
  assert.ok(!orchestrationState.pendingWorkerRecoveries.has('rec-done'), 'the moot recovery is dropped');
}

async function checkExhaustionVerdict(db) {
  clearSharedState();
  const garage = require('../src/services/workerGarageService');
  await garage.releaseStaleWorkerClaims(db, 'rec-fail');
  await garage.enterIdleState(db, 'rec-fail');
  const snapshot = await garage.state(db, 'rec-orch');
  for (let index = 0; index < snapshot.available; index += 1) {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES (?, ?, 'implementation', 'running', 'worker', 'rec-orch')", `rec-fill-${index}`, `rec-fill-${index}`);
  }
  assert.equal((await garage.state(db, 'rec-orch')).available, 0, 'the garage is full before the failing dispatch');
  const { mission, report, decision } = queuedRecovery('rec-fail', 'unresolved_task');
  orchestrationState.pendingWorkerRecoveries.set('rec-fail', { mission, report, decision, dispatchAttempts: MAX_RECOVERY_DISPATCH_ATTEMPTS - 1 });
  assert.equal(await dispatchWorkerRecovery('rec-fail'), false, 'dispatch fails when the garage is full');
  assert.ok(emitted.some((args) => args[1] === 'WORKER_RECOVERY_DISPATCH_FAILED'), 'the dispatch failure is reported');
  const exhausted = emitted.filter((args) => args[1] === 'WORKER_RECOVERY_EXHAUSTED');
  assert.equal(exhausted.length, 1, 'budget exhaustion ends with one terminal verdict, not silence');
  assert.equal(exhausted[0][5], 'error', 'exhaustion is an error verdict');
  assert.equal(exhausted[0][4].terminal, true, 'exhaustion is terminal');
  assert.ok(!orchestrationState.pendingWorkerRecoveries.has('rec-fail'), 'nothing is re-queued after exhaustion');
}

function checkQueueRefresh() {
  clearSharedState();
  const first = queueWorkerRecovery(baseMission('rec-q', { recoveryAttempt: 0 }), failureEvent('unresolved_task'));
  assert.equal(first.queued, true);
  const refreshed = queueWorkerRecovery(baseMission('rec-q', { recoveryAttempt: 1 }), failureEvent('unresolved_task'));
  assert.equal(refreshed.queued, true, 'a newer failure refreshes the pending recovery checkpoint');
  assert.equal(refreshed.refreshed, true);
  assert.equal(orchestrationState.pendingWorkerRecoveries.get('rec-q').report.attempt, 1);
  const duplicate = queueWorkerRecovery(baseMission('rec-q', { recoveryAttempt: 1 }), failureEvent('unresolved_task'));
  assert.equal(duplicate.duplicate, true, 'an identical failure stays deduplicated');
}

async function checkBoundedObservation() {
  clearSharedState();
  assert.equal(missionExecution.postShutdownBackoffDelayMs(1), 1000);
  assert.equal(missionExecution.postShutdownBackoffDelayMs(2), 2000);
  assert.equal(missionExecution.postShutdownBackoffDelayMs(3), 4000);
  assert.equal(missionExecution.postShutdownBackoffDelayMs(10), 30000, 'backoff is capped');
  for (let index = 0; index < 20; index += 1) {
    const observed = missionExecution.postShutdownObservations.get('storm-agent');
    if (observed) observed.lastCheckAt = 0;
    await missionExecution.handlePostShutdown('storm-agent', false);
  }
  assert.equal(recoveryCalls.length, 0, 'idle checks dispatch nothing');
  const closed = emitted.filter((args) => args[1] === 'WORKER_RECOVERY_OBSERVATION_CLOSED');
  assert.equal(closed.length, 1, 'one terminal verdict closes the idle observation loop');
  const decisions = emitted.filter((args) => args[1] === 'WORKER_RECOVERY_DECISION');
  assert.equal(decisions.length, 0, 'idle checks never spam recovery decisions');

  clearSharedState();
  orchestrationState.pendingWorkerRecoveries.set('busy-agent', { mission: {}, report: {}, decision: {} });
  await missionExecution.handlePostShutdown('busy-agent', false);
  assert.equal(recoveryCalls.length, 1, 'queued work is still dispatched');
  assert.equal(emitted.filter((args) => args[1] === 'WORKER_RECOVERY_DECISION').length, 1);

  clearSharedState();
  orchestrationState.pendingWorkerRecoveries.set('cancel-agent', { mission: {}, report: {}, decision: {} });
  await missionExecution.handlePostShutdown('cancel-agent', true);
  assert.equal(recoveryCalls.length, 0, 'cancelled shutdowns dispatch nothing');
  assert.ok(!orchestrationState.pendingWorkerRecoveries.has('cancel-agent'), 'cancelled recoveries are dropped');
}

async function run() {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-admin-password';
  const db = await getDatabase(DB_PATH);
  try {
    await setup(db);
    clearSharedState();
    await checkSameIdentityRedispatch(db);
    await checkReplacementRedispatch(db);
    await checkTrinityRecoveryKeepsSealedWorkspace(db);
    await checkRecoveryLineageUsesWorkspaceParent(db);
    await checkValidatedWorkNotRedispatched(db);
    await checkExhaustionVerdict(db);
    checkQueueRefresh();
    await checkBoundedObservation();
  } finally {
    clearSharedState();
    await closeDatabase();
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  }
  console.log('Worker recovery redispatch checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
