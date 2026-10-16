'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const recovery = require('../src/services/morphogenesis/morphogenesisEpochRecovery');
const store = require('../src/services/morphogenesis/morphogenesisEpochStore');
const orchestration = require('../src/services/agentOrchestrationState');
const roundService = require('../src/services/agentRoundService');
const durable = require('../src/services/durableContinuationService');
const adapter = require('../src/services/agentRuntimeAdapter');

const QUEUE_SQL = `CREATE TABLE continuation_queue (id TEXT PRIMARY KEY, agent_id TEXT, orchestrator_id TEXT,
  mission_json TEXT, status TEXT, organization_id TEXT, project_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  available_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
const SCOPE = { organizationId: null, projectId: null };

async function main() {
  await checkBoundedSweep();
  await checkExplicitLimitCapped();
  await checkAmbiguousNeverReplayed();
  await checkActiveWorkerSkipped();
  console.log('Morphogenesis startup sweep stays bounded to 32 checkpoints, keeps oldest-first order, '
    + 'never replays ambiguous dispatch, and skips active workers: PASS');
}

async function checkBoundedSweep() {
  const db = openDatabase();
  try {
    await db.exec(QUEUE_SQL);
    for (let index = 0; index < 35; index += 1) await store.saveCheckpoint(db, advancingPayload(index));
    const result = await recovery.recoverStartupCheckpoints(db);
    assert.equal(result.inspected, 32);
    assert.equal(result.truncated, true);
    assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
    assert.equal((await store.loadCheckpoint(db, { missionId: 'bound-000', ...SCOPE })).phase,
      'recovery_required', 'the oldest checkpoint is swept first');
    assert.equal((await store.loadCheckpoint(db, { missionId: 'bound-034', ...SCOPE })).phase,
      'advancing', 'checkpoints beyond the bound wait for the next boot');
  } finally {
    for (let index = 0; index < 35; index += 1) orchestration.autonomousRounds.delete(`bound-${pad(index)}-orchestrator`);
    await db.close();
  }
}

async function checkExplicitLimitCapped() {
  const db = openDatabase();
  try {
    await db.exec(QUEUE_SQL);
    for (let index = 0; index < 40; index += 1) await store.saveCheckpoint(db, advancingPayload(index));
    const result = await recovery.recoverStartupCheckpoints(db, { limit: 100 });
    assert.equal(result.inspected, 32, 'an explicit limit cannot widen the startup sweep beyond 32');
    assert.equal(result.truncated, true);
  } finally {
    for (let index = 0; index < 40; index += 1) orchestration.autonomousRounds.delete(`bound-${pad(index)}-orchestrator`);
    await db.close();
  }
}

async function checkAmbiguousNeverReplayed() {
  const db = openDatabase();
  const dispatches = [];
  const originalDispatch = roundService.dispatchPendingContinuation;
  roundService.dispatchPendingContinuation = async (agentId) => { dispatches.push(agentId); };
  try {
    await db.exec(QUEUE_SQL);
    await store.saveCheckpoint(db, advancingPayload(0, 'amb-advancing'));
    await insertQueueRow(db, { id: 'amb-row', agentId: 'ambiguous-worker', orchestratorId: 'amb-advancing-orchestrator',
      status: 'dispatch_failed_ambiguous', mission: sweepMission({ rowId: 'amb-row', missionId: 'amb-advancing',
        orchestratorId: 'amb-advancing-orchestrator', agentId: 'ambiguous-worker' }) });
    await store.saveCheckpoint(db, collectingPayload('collect-sweep', 'collect-orchestrator', ['sweep-idle']));
    await insertQueueRow(db, { id: 'idle-row', agentId: 'sweep-idle', orchestratorId: 'collect-orchestrator',
      status: 'pending', mission: sweepMission({ rowId: 'idle-row', missionId: 'collect-sweep',
        orchestratorId: 'collect-orchestrator', agentId: 'sweep-idle' }) });
    const result = await recovery.recoverStartupCheckpoints(db);
    assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
    assert.equal((await store.loadCheckpoint(db, { missionId: 'amb-advancing', ...SCOPE })).phase,
      'recovery_required', 'ambiguous dispatch waits for explicit operator reconciliation');
    assert.ok(!dispatches.includes('ambiguous-worker'), 'ambiguous dispatch is never replayed automatically');
    assert.ok(dispatches.includes('sweep-idle'), 'durable pending work is redispatched');
  } finally {
    roundService.dispatchPendingContinuation = originalDispatch;
    orchestration.autonomousRounds.delete('amb-advancing-orchestrator');
    orchestration.autonomousRounds.delete('collect-orchestrator');
    await db.close();
  }
}

async function checkActiveWorkerSkipped() {
  const claims = [];
  const started = [];
  const marks = [];
  const originalClaim = durable.claimContinuation;
  const originalMark = durable.markContinuation;
  const originalStart = adapter.startMission;
  durable.claimContinuation = async (input) => { claims.push(input); return true; };
  durable.markContinuation = async (input) => { marks.push(input); };
  adapter.startMission = async (mission) => { started.push(mission.agentId); return { started: true }; };
  orchestration.pendingContinuations.set('guard-idle', { continuationId: 'cont-idle',
    agentId: 'guard-idle', orchestratorAgentId: 'guard-orchestrator' });
  orchestration.pendingContinuations.set('guard-active', { continuationId: 'cont-active',
    agentId: 'guard-active', orchestratorAgentId: 'guard-orchestrator' });
  orchestration.activeProcesses.set('guard-active', { pid: 1 });
  try {
    await roundService.dispatchPendingContinuation('guard-active');
    await roundService.dispatchPendingContinuation('guard-idle');
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(!claims.some((claim) => claim.agentId === 'guard-active'),
      'an active worker is never claimed again');
    assert.ok(!started.includes('guard-active'), 'an active worker is not redispatched');
    assert.ok(orchestration.pendingContinuations.has('guard-active'), 'the active claim stays pending');
    assert.equal(claims.filter((claim) => claim.agentId === 'guard-idle').length, 1);
    assert.ok(started.includes('guard-idle'), 'the idle worker is dispatched after its atomic claim');
    assert.ok(marks.some((mark) => mark.id === 'cont-idle' && mark.status === 'dispatched'));
  } finally {
    durable.claimContinuation = originalClaim;
    durable.markContinuation = originalMark;
    adapter.startMission = originalStart;
    orchestration.activeProcesses.delete('guard-active');
    orchestration.pendingContinuations.delete('guard-idle');
    orchestration.pendingContinuations.delete('guard-active');
  }
}

function advancingPayload(index, prefix = 'bound') {
  const missionId = prefix === 'bound' ? `${prefix}-${pad(index)}` : prefix;
  const orchestratorId = `${missionId}-orchestrator`;
  return { missionId, organizationId: null, projectId: null, epoch: 0, phase: 'advancing',
    expectedRevision: 0, idempotencyKey: `${missionId}-advancing`,
    state: { orchestratorId, epoch: 0, advanced: true, plan: {}, normalizedMission: { missionId },
      workers: [], workerIds: [], results: [], epochBudget: { total: 40 } },
    results: [], budget: { total: 40 }, barrier: { status: 'quiescent' } };
}

function collectingPayload(missionId, orchestratorId, agentIds) {
  return { missionId, organizationId: null, projectId: null, epoch: 1, phase: 'collecting',
    expectedRevision: 0, idempotencyKey: `${missionId}-collecting`,
    state: { orchestratorId, epoch: 1, advanced: false, plan: {}, normalizedMission: { missionId },
      workers: agentIds.map((agentId) => [agentId, { agentId }]), workerIds: agentIds,
      results: [], epochBudget: { total: 40 } },
    results: [], budget: { total: 40 }, barrier: { status: 'collecting' } };
}

function sweepMission(input) {
  return { agentId: input.agentId, continuationId: input.rowId,
    budgetRound: { stage: 'morphogenesis_epoch', orchestratorId: input.orchestratorId,
      missionId: input.missionId, epoch: 1, epochBudgetSnapshot: { total: 40, activeEpoch: 1, reserved: 12 } },
    executionBudget: { tokens: 6 } };
}

async function insertQueueRow(db, input) {
  await db.run('INSERT INTO continuation_queue (id, agent_id, orchestrator_id, mission_json, status)'
    + ' VALUES (?, ?, ?, ?, ?)', input.id, input.agentId, input.orchestratorId,
  JSON.stringify(input.mission), input.status);
}

function pad(index) {
  return String(index).padStart(3, '0');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
