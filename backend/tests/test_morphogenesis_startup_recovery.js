'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const recovery = require('../src/services/morphogenesis/morphogenesisEpochRecovery');
const store = require('../src/services/morphogenesis/morphogenesisEpochStore');
const rounds = require('../src/services/agentOrchestrationState').autonomousRounds;
const roundService = require('../src/services/agentRoundService');

async function main() {
  const db = openDatabase();
  await db.exec(`CREATE TABLE continuation_queue (id TEXT PRIMARY KEY, agent_id TEXT, orchestrator_id TEXT,
    mission_json TEXT, status TEXT, organization_id TEXT, project_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    available_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  const dispatches = [];
  const originalDispatch = roundService.dispatchPendingContinuation;
  roundService.dispatchPendingContinuation = async id => dispatches.push(id);
  try {
    await saveCheckpoint(db, checkpoint('queued-startup', 'queued-orchestrator'));
    await insertQueueRow(db, { id: 'pending-queue', agentId: 'startup-pending', orchestratorId: 'queued-orchestrator',
      status: 'pending', mission: continuation({ missionId: 'queued-startup', orchestratorId: 'queued-orchestrator',
        agentId: 'startup-pending', status: 'pending' }) });
    await insertQueueRow(db, { id: 'dispatched-queue', agentId: 'startup-dispatched', orchestratorId: 'queued-orchestrator',
      status: 'dispatched', mission: continuation({ missionId: 'queued-startup', orchestratorId: 'queued-orchestrator',
        agentId: 'startup-dispatched', status: 'dispatched' }) });
    await saveCheckpoint(db, collectingCheckpoint('collecting-startup', 'collecting-orchestrator', 'collecting-pending'));
    await insertQueueRow(db, { id: 'collecting-pending-queue', agentId: 'collecting-pending',
      orchestratorId: 'collecting-orchestrator', status: 'pending',
      mission: continuation({ missionId: 'collecting-startup', orchestratorId: 'collecting-orchestrator',
        agentId: 'collecting-pending', status: 'pending' }) });
    await saveCheckpoint(db, collectingCheckpoint('ambiguous-startup', 'ambiguous-orchestrator', 'ambiguous-worker'));
    await insertQueueRow(db, { id: 'ambiguous-queue', agentId: 'ambiguous-worker',
      orchestratorId: 'ambiguous-orchestrator', status: 'dispatching',
      mission: continuation({ missionId: 'ambiguous-startup', orchestratorId: 'ambiguous-orchestrator',
        agentId: 'ambiguous-worker', status: 'dispatching' }) });
    await saveCheckpoint(db, checkpoint('orphan-startup', 'orphan-orchestrator'));
    await saveCheckpoint(db, checkpoint('trinity-startup', 'trinity-orchestrator', true));

    const result = await recovery.recoverStartupCheckpoints(db);
    assert.equal(result.inspected, 5);
    assert.equal(result.restored, 2);
    assert.equal(result.actionable, 2);
    assert.equal(result.trinityExcluded, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.truncated, false);
    assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0,
      'startup recovery reports measured elapsed time');
    assert.deepEqual(dispatches, ['startup-pending', 'collecting-pending'],
      'startup dispatches durable pending work exactly once, including a collecting epoch interrupted after checkpointing');

    const restored = rounds.get('queued-orchestrator');
    assert.deepEqual([...restored.workerIds], ['startup-pending', 'startup-dispatched']);
    assert.deepEqual(restored.epochBudget, { total: 40, activeEpoch: 1, reserved: 12 },
      'recovery keeps the exact budget snapshot stored in durable continuations');
    assert.equal((await store.loadCheckpoint(db, { missionId: 'queued-startup', organizationId: null, projectId: null })).phase,
      'collecting');
    assert.equal((await store.loadCheckpoint(db, { missionId: 'orphan-startup', organizationId: null, projectId: null })).phase,
      'recovery_required', 'a checkpoint without durable continuations becomes operator actionable');
    assert.equal((await store.loadCheckpoint(db, { missionId: 'ambiguous-startup', organizationId: null, projectId: null })).phase,
      'recovery_required', 'a crash after dispatch claim is never replayed automatically');
    assert.ok(!dispatches.includes('ambiguous-worker'), 'ambiguous dispatch is not sent again');
    assert.equal((await store.loadCheckpoint(db, { missionId: 'trinity-startup', organizationId: null, projectId: null })).phase,
      'advancing', 'Trinity remains outside the general startup sweep');
    console.log('Morphogenesis startup recovery dispatches only durable pending continuations and fences ambiguous checkpoints.');
  } finally {
    roundService.dispatchPendingContinuation = originalDispatch;
    rounds.delete('queued-orchestrator');
    rounds.delete('orphan-orchestrator');
    await db.close();
  }
}

function checkpoint(missionId, orchestratorId, trinity = false) {
  return { missionId, organizationId: null, projectId: null, epoch: 0, phase: 'advancing',
    expectedRevision: 0, idempotencyKey: `${missionId}-advancing`,
    state: { orchestratorId, epoch: 0, advanced: true, plan: { trinity: { activated: trinity } },
      normalizedMission: { missionId }, workers: [], workerIds: [], results: [], epochBudget: { total: 40 } },
    results: [], budget: { total: 40 }, barrier: { status: 'quiescent' } };
}

function collectingCheckpoint(missionId, orchestratorId, agentId) {
  return { missionId, organizationId: null, projectId: null, epoch: 1, phase: 'collecting',
    expectedRevision: 0, idempotencyKey: `${missionId}-collecting`,
    state: { orchestratorId, epoch: 1, advanced: false, plan: {}, normalizedMission: { missionId },
      workers: [[agentId, { agentId }]], workerIds: [agentId], results: [], epochBudget: { total: 40 } },
    results: [], budget: { total: 40 }, barrier: { status: 'collecting' } };
}

async function saveCheckpoint(db, payload) {
  await store.saveCheckpoint(db, payload);
}

function continuation(input) {
  const { missionId, orchestratorId, agentId, status } = input;
  return { agentId, budgetRound: { stage: 'morphogenesis_epoch', orchestratorId, missionId, epoch: 1,
    epochBudgetSnapshot: { total: 40, activeEpoch: 1, reserved: 12 } },
  executionBudget: { tokens: 6 }, continuationStatus: status };
}

async function insertQueueRow(db, input) {
  await db.run(`INSERT INTO continuation_queue (id, agent_id, orchestrator_id, mission_json, status)
    VALUES (?, ?, ?, ?, ?)`, input.id, input.agentId, input.orchestratorId, JSON.stringify(input.mission), input.status);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
