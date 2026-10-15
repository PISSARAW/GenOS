'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const episodeRuntime = require('../src/services/missionEpisodeRuntime');
const cells = require('../src/services/workerCellThreadRuntime');
const directBridge = require('../src/services/directWorkerCellBridge');
const autonomousBridge = require('../src/services/autonomousWorkerCellBridge');
const threads = require('../src/services/cellThreadService');

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT,
      execution_mode TEXT, parent_agent_id TEXT);
    CREATE TABLE strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
      version INTEGER NOT NULL, contract_hash TEXT NOT NULL);
    INSERT INTO missions VALUES ('mission-a', 'A', 'active');
    INSERT INTO missions VALUES ('mission-b', 'B', 'active');
    INSERT INTO workspaces VALUES ('workspace-a', 'org-a', 'project-a');
    INSERT INTO agents VALUES ('orchestrator-a', 'workspace-a', 'orchestrator', NULL);
    INSERT INTO agents VALUES ('worker-a', 'workspace-a', 'worker', 'orchestrator-a');
    INSERT INTO agents VALUES ('worker-b', 'workspace-a', 'worker', 'orchestrator-a');
    INSERT INTO strategy_contracts VALUES ('strategy-a-1',
      'orchestrator-a', 1, 'sha256:contract');`);
  const root = await episodeRuntime.ensure(db, {
    missionId: 'mission-a', orchestratorId: 'orchestrator-a',
    action: 'orchestrate', request: {}
  });
  return { db, root, missionScope: {
    available: true, episodeId: root.episodeId, rootThreadId: root.rootThreadId
  } };
}

function dispatchInput(state, workerId = 'worker-a') {
  return {
    missionId: 'mission-a', orchestratorId: 'orchestrator-a',
    workerId, missionScope: state.missionScope
  };
}

function activationInput(state, runtime, workerId = 'worker-a') {
  return {
    executionMode: 'worker', missionId: 'mission-a', workerId,
    missionScope: { ...state.missionScope, threadId: runtime.threadId },
    organizationId: 'org-a', projectId: 'project-a'
  };
}

test('worker dispatch creates one idempotent child and propagates exact correlation', async () => {
  const state = await fixture();
  try {
    const context = { ...dispatchInput(state), id: 'worker-a',
      request: { missionScope: state.missionScope } };
    const mission = await directBridge.prepare(state.db, { context, mission: {
      missionId: 'mission-a', missionScope: state.missionScope
    } });
    const second = await cells.ensureDispatched(state.db, dispatchInput(state));
    assert.equal(mission.episodeId, state.root.episodeId);
    assert.equal(mission.threadId, second.threadId);
    assert.equal(mission.missionScope.threadId, second.threadId);
    assert.equal(second.thread.parentThreadId, state.root.rootThreadId);
    assert.equal(second.thread.status, 'ready');
    assert.deepEqual(directBridge.receipt(context), {
      episodeId: state.root.episodeId, threadId: second.threadId
    });
    assert.equal((await state.db.get(`SELECT COUNT(*) AS count FROM cell_threads
      WHERE worker_id = 'worker-a'`)).count, 1);
  } finally { await state.db.close(); }
});

test('worker activation and observed outcomes never promote an unverified execution', async () => {
  const state = await fixture();
  try {
    const dispatched = await cells.ensureDispatched(state.db, dispatchInput(state));
    const active = await cells.activate(state.db, activationInput(state, dispatched));
    assert.equal(active.thread.status, 'active');
    const observed = await cells.observeOutcome(state.db, {
      executionMode: 'worker', workerId: 'worker-a', missionId: 'mission-a',
      episodeId: state.root.episodeId, threadId: dispatched.threadId,
      status: 'unverified', reason: 'missing evidence'
    });
    assert.equal(observed.status, 'evidence_quiescent');
    assert.notEqual(observed.status, 'completed_execution');
  } finally { await state.db.close(); }
});

test('worker cell dispatch rejects mission, parent and worker identity collisions', async () => {
  const state = await fixture();
  try {
    await assert.rejects(cells.ensureDispatched(state.db, {
      ...dispatchInput(state), missionId: 'mission-b'
    }), (error) => error.code === 'WORKER_CELL_PARENT_COLLISION');
    await threads.create(state.db, {
      missionId: 'mission-a', episodeId: state.root.episodeId,
      organizationId: 'org-a', projectId: 'project-a',
      threadId: 'thread-manual', parentThreadId: state.root.rootThreadId,
      workerId: 'worker-a', cellKind: 'worker'
    });
    await assert.rejects(cells.ensureDispatched(state.db, dispatchInput(state)),
      (error) => error.code === 'WORKER_CELL_IDENTITY_COLLISION');
    await assert.rejects(cells.ensureDispatched(state.db, {
      ...dispatchInput(state, 'worker-b'),
      missionScope: { ...state.missionScope, rootThreadId: 'missing-root' }
    }), (error) => error.code === 'WORKER_CELL_PARENT_NOT_FOUND');
  } finally { await state.db.close(); }
});

test('autonomous fan-out binds distinct child threads and exposes dispatch receipts', async () => {
  const state = await fixture();
  try {
    const ctx = { db: state.db, agentId: 'orchestrator-a',
      normalizedMission: { missionId: 'mission-a', missionScope: state.missionScope },
      workerDispatchActionId: 'dispatch-action-1' };
    const workers = [{ agentId: 'worker-a' }, { agentId: 'worker-b' }];
    await autonomousBridge.bind(ctx, workers);
    const receipts = autonomousBridge.receipts(workers);
    assert.equal(receipts.length, 2);
    assert.equal(new Set(receipts.map((item) => item.threadId)).size, 2);
    assert.ok(workers.every((worker) => worker.missionScope.threadId));
    assert.ok(workers.every((worker) => worker.episodeId === state.root.episodeId));
  } finally { await state.db.close(); }
});
