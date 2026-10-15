'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const episodeRuntime = require('../src/services/missionEpisodeRuntime');
const recovery = require('../src/services/missionEpisodeRecoveryService');
const cells = require('../src/services/cellThreadService');

const DEAD_PID = 2147483647;

async function fixture(ownerPid = DEAD_PID) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, runtime_pid INTEGER);
    CREATE TABLE strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
      version INTEGER NOT NULL, contract_hash TEXT NOT NULL);
    CREATE TABLE strategy_execution_runs (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, status TEXT NOT NULL,
      guardrail_reason TEXT, completed_at TEXT
    );
    CREATE TABLE mission_execution_authority (
      mission_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, generation INTEGER NOT NULL,
      token TEXT NOT NULL, state TEXT NOT NULL, owner_pid INTEGER, claimed_at TEXT
    );
    INSERT INTO missions VALUES ('mission-a', 'A', 'active');
    INSERT INTO workspaces VALUES ('workspace-a', 'org-a', 'project-a');
    INSERT INTO agents VALUES ('orchestrator-a', 'workspace-a', ${ownerPid});
    INSERT INTO strategy_contracts VALUES ('strategy-a-1',
      'orchestrator-a', 1, 'sha256:contract');
    INSERT INTO strategy_execution_runs VALUES (
      'run-a', 'orchestrator-a', 'running', NULL, NULL
    );
    INSERT INTO mission_execution_authority VALUES (
      'mission-a', 'orchestrator-a', 3, 'secret-token', 'running', ${ownerPid}, CURRENT_TIMESTAMP
    );`);
  const runtime = await episodeRuntime.ensure(db, {
    missionId: 'mission-a', orchestratorId: 'orchestrator-a',
    action: 'orchestrate', request: {}
  });
  await episodeRuntime.bindOwner(db, {
    runtime, orchestratorId: 'orchestrator-a',
    launch: { executionRun: { id: 'run-a' } }
  });
  const worker = await cells.create(db, {
    missionId: 'mission-a', episodeId: runtime.episodeId,
    organizationId: 'org-a', projectId: 'project-a',
    parentThreadId: runtime.rootThreadId, workerId: 'worker-a', cellKind: 'worker'
  });
  await cells.transition(db, { threadId: worker.threadId, missionId: 'mission-a',
    organizationId: 'org-a', projectId: 'project-a', status: 'ready' });
  await cells.transition(db, { threadId: worker.threadId, missionId: 'mission-a',
    organizationId: 'org-a', projectId: 'project-a', status: 'active' });
  return { db, runtime, worker };
}

function scope(runtime) {
  return {
    episodeId: runtime.episodeId, missionId: 'mission-a',
    organizationId: 'org-a', projectId: 'project-a'
  };
}

test('a live persisted owner leaves the active episode and CellThreads intact', async () => {
  const state = await fixture(process.pid);
  try {
    const result = await recovery.reconcile(state.db, scope(state.runtime));
    assert.deepEqual(result, {
      recovered: false, reason: 'MISSION_EPISODE_OWNER_ALIVE'
    });
    const episode = await state.db.get('SELECT status FROM mission_episodes WHERE episode_id = ?',
      state.runtime.episodeId);
    const statuses = await state.db.all('SELECT status FROM cell_threads ORDER BY thread_id');
    assert.equal(episode.status, 'active');
    assert.deepEqual(new Set(statuses.map((row) => row.status)), new Set(['active']));
    assert.equal((await state.db.get(
      'SELECT COUNT(*) AS count FROM mission_episode_recovery_receipts')).count, 0);
  } finally { await state.db.close(); }
});

test('an orphaned run is failed and its episode lineage is quarantined exactly once', async () => {
  const state = await fixture();
  try {
    await state.db.run('UPDATE agents SET runtime_pid = NULL WHERE id = ?', 'orchestrator-a');
    const [first] = await recovery.reconcileAbandoned(state.db);
    const second = await recovery.reconcile(state.db, scope(state.runtime));
    assert.equal(first.recovered, true);
    assert.equal(first.idempotent, false);
    assert.equal(first.receipt.outcome, 'interrupted_quarantined');
    assert.equal(first.receipt.ownerRunId, 'run-a');
    assert.equal(first.receipt.authorityGeneration, 3);
    assert.equal(first.receipt.quarantinedThreads, 2);
    assert.equal(second.recovered, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.receipt.receiptId, first.receipt.receiptId);
    assert.deepEqual(await recovery.getReceipt(state.db, scope(state.runtime)), first.receipt);
    const episode = await state.db.get('SELECT status FROM mission_episodes WHERE episode_id = ?',
      state.runtime.episodeId);
    const statuses = await state.db.all('SELECT status FROM cell_threads');
    const run = await state.db.get('SELECT status, guardrail_reason FROM strategy_execution_runs');
    const authority = await state.db.get('SELECT state FROM mission_execution_authority');
    assert.equal(episode.status, 'failed');
    assert.deepEqual(new Set(statuses.map((row) => row.status)), new Set(['quarantined']));
    assert.deepEqual(run, {
      status: 'failed', guardrail_reason: 'mission_episode_owner_interrupted'
    });
    assert.equal(authority.state, 'failed');
    assert.equal((await state.db.get(
      'SELECT COUNT(*) AS count FROM mission_episode_recovery_receipts')).count, 1);
    await assert.rejects(state.db.run(`UPDATE mission_episode_recovery_receipts
      SET outcome = outcome WHERE receipt_id = ?`, first.receipt.receiptId),
    /MISSION_EPISODE_RECOVERY_RECEIPT_IMMUTABLE/);
  } finally { await state.db.close(); }
});

test('scope and persisted owner evidence are checked before any recovery mutation', async () => {
  const state = await fixture();
  try {
    await state.db.run('UPDATE agents SET runtime_pid = NULL WHERE id = ?', 'orchestrator-a');
    await assert.rejects(recovery.reconcile(state.db, {
      ...scope(state.runtime), organizationId: 'org-other'
    }), (error) => error.code === 'MISSION_EPISODE_SCOPE_DENIED');
    await state.db.run(`UPDATE mission_execution_authority SET generation = generation + 1
      WHERE mission_id = 'mission-a'`);
    await assert.rejects(recovery.reconcile(state.db, scope(state.runtime)),
      (error) => error.code === 'MISSION_EPISODE_RECOVERY_EVIDENCE_MISMATCH');
    assert.equal((await state.db.get('SELECT status FROM mission_episodes')).status, 'active');
    assert.deepEqual(new Set((await state.db.all('SELECT status FROM cell_threads'))
      .map((row) => row.status)), new Set(['active']));
    assert.equal((await state.db.get('SELECT status FROM strategy_execution_runs')).status,
      'running');
  } finally { await state.db.close(); }
});

test('a replacement runtime prevents recovery of the older episode binding', async () => {
  const state = await fixture();
  try {
    await state.db.run('UPDATE agents SET runtime_pid = ? WHERE id = ?',
      process.pid, 'orchestrator-a');
    const result = await recovery.reconcile(state.db, scope(state.runtime));
    assert.deepEqual(result, {
      recovered: false, reason: 'MISSION_EPISODE_RUNTIME_REPLACED'
    });
    assert.equal((await state.db.get('SELECT status FROM mission_episodes')).status, 'active');
  } finally { await state.db.close(); }
});

test('receipt persistence failure rolls back the whole recovery transaction', async () => {
  const state = await fixture();
  try {
    await state.db.run('UPDATE agents SET runtime_pid = NULL WHERE id = ?', 'orchestrator-a');
    await state.db.exec(`CREATE TRIGGER reject_test_recovery_receipt
      BEFORE INSERT ON mission_episode_recovery_receipts
      BEGIN SELECT RAISE(ABORT, 'TEST_RECOVERY_RECEIPT_REJECTED'); END;`);
    await assert.rejects(recovery.reconcile(state.db, scope(state.runtime)),
      /TEST_RECOVERY_RECEIPT_REJECTED/);
    assert.equal((await state.db.get('SELECT status FROM mission_episodes')).status, 'active');
    assert.deepEqual(new Set((await state.db.all('SELECT status FROM cell_threads'))
      .map((row) => row.status)), new Set(['active']));
    assert.equal((await state.db.get('SELECT status FROM strategy_execution_runs')).status,
      'running');
    assert.equal((await state.db.get('SELECT state FROM mission_execution_authority')).state,
      'running');
  } finally { await state.db.close(); }
});
