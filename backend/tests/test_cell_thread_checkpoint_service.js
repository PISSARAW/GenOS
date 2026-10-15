'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const episodeRuntime = require('../src/services/missionEpisodeRuntime');
const cells = require('../src/services/workerCellThreadRuntime');
const threads = require('../src/services/cellThreadService');
const checkpoints = require('../src/services/cellThreadCheckpointService');

function provingRuntime(overrides = {}) {
  return async (request) => ({
    proven: true, checkpointId: request.checkpointId,
    checkpointHash: request.checkpointHash, missionId: request.missionId,
    episodeId: request.episodeId, threadId: request.threadId,
    workerId: request.workerId, organizationId: request.organizationId,
    projectId: request.projectId, contextHash: request.contextHash,
    proofCode: 'runtime-context-restored', ...overrides
  });
}

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
  const runtime = await cells.ensureDispatched(db, {
    missionId: 'mission-a', orchestratorId: 'orchestrator-a', workerId: 'worker-a',
    missionScope: { available: true, episodeId: root.episodeId,
      rootThreadId: root.rootThreadId }
  });
  const scope = { organizationId: 'org-a', projectId: 'project-a',
    missionId: 'mission-a', episodeId: root.episodeId,
    threadId: runtime.threadId, workerId: 'worker-a' };
  return { db, scope };
}

test('checkpoint is append-only, bounded, integrity verified and idempotent', async () => {
  const state = await fixture();
  try {
    const input = { ...state.scope, checkpointId: 'checkpoint-a',
      context: { cursor: 7, plan: ['inspect', 'resume'] },
      evidenceRefs: ['evidence:b', 'evidence:a', 'evidence:a'] };
    const first = await checkpoints.seal(state.db, input);
    const second = await checkpoints.seal(state.db, input);
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.deepEqual(first.checkpoint.evidenceRefs, ['evidence:a', 'evidence:b']);
    assert.match(first.checkpoint.contextHash, /^sha256:[a-f0-9]{64}$/);
    await assert.rejects(checkpoints.seal(state.db, { ...state.scope,
      checkpointId: 'checkpoint-invalid-json', context: { absent: undefined } }),
    (error) => error.code === 'CELL_CHECKPOINT_CONTEXT_INVALID');
    await assert.rejects(checkpoints.seal(state.db, { ...state.scope,
      checkpointId: 'checkpoint-sensitive',
      context: { nested: [{ Authorization: 'Bearer value' }] } }),
    (error) => error.code === 'CELL_CHECKPOINT_CONTEXT_SENSITIVE');
    await assert.rejects(state.db.run(`UPDATE cell_thread_checkpoints
      SET context_size = 0 WHERE checkpoint_id = 'checkpoint-a'`),
    /CELL_THREAD_CHECKPOINT_IMMUTABLE/);
    await assert.rejects(checkpoints.seal(state.db, { ...input, context: { cursor: 8 } }),
      (error) => error.code === 'CELL_CHECKPOINT_COLLISION');
    await assert.rejects(checkpoints.seal(state.db, { ...state.scope,
      context: { payload: 'x'.repeat(262145) } }),
    (error) => error.code === 'CELL_CHECKPOINT_CONTEXT_TOO_LARGE');
  } finally { await state.db.close(); }
});

test('resume verifies exact cell scope and creates one active revision', async () => {
  const state = await fixture();
  try {
    await threads.transition(state.db, { ...state.scope, status: 'active' });
    const quiescent = await threads.transition(state.db, {
      ...state.scope, status: 'evidence_quiescent', stopReason: 'awaiting proof'
    });
    const sealed = await checkpoints.seal(state.db, { ...state.scope,
      checkpointId: 'checkpoint-resume', context: { cursor: 11 },
      evidenceRefs: ['proof:pending'] });
    assert.equal(sealed.checkpoint.threadRevision, quiescent.revision);
    await assert.rejects(checkpoints.resume(state.db, {
      ...state.scope, workerId: 'worker-b', checkpointId: 'checkpoint-resume',
      runtimeControl: provingRuntime()
    }), (error) => error.code === 'CELL_CHECKPOINT_CELL_MISMATCH');
    await assert.rejects(checkpoints.resume(state.db, {
      ...state.scope, organizationId: 'org-other', checkpointId: 'checkpoint-resume',
      runtimeControl: provingRuntime()
    }), (error) => error.code === 'CELL_CHECKPOINT_SCOPE_DENIED');
    await assert.rejects(checkpoints.resume(state.db, {
      ...state.scope, checkpointId: 'checkpoint-resume'
    }), (error) => error.code === 'CELL_CHECKPOINT_RUNTIME_UNAVAILABLE');
    await assert.rejects(checkpoints.resume(state.db, {
      ...state.scope, checkpointId: 'checkpoint-resume',
      runtimeControl: provingRuntime({ proven: false })
    }), (error) => error.code === 'CELL_CHECKPOINT_RESUME_UNPROVEN');
    const unchanged = await threads.get(state.db, state.scope);
    assert.equal(unchanged.status, 'evidence_quiescent');
    assert.equal(unchanged.revision, quiescent.revision);
    assert.equal((await state.db.get(`SELECT COUNT(*) AS count
      FROM cell_thread_checkpoint_resumptions`)).count, 0);
    const resumed = await checkpoints.resume(state.db, {
      ...state.scope, checkpointId: 'checkpoint-resume',
      runtimeControl: provingRuntime()
    });
    assert.equal(resumed.thread.status, 'active');
    assert.equal(resumed.thread.revision, quiescent.revision + 1);
    assert.equal(resumed.thread.checkpointId, 'checkpoint-resume');
    assert.equal(resumed.thread.contextSize, sealed.checkpoint.contextSize);
    assert.notEqual(resumed.thread.status, 'completed_execution');
    assert.equal(resumed.resumption.resumedState, 'active');
    assert.equal(resumed.resumption.proofCode, 'runtime-context-restored');
    assert.match(resumed.resumption.proofHash, /^sha256:[a-f0-9]{64}$/);
    const retry = await checkpoints.resume(state.db, {
      ...state.scope, checkpointId: 'checkpoint-resume'
    });
    assert.equal(retry.idempotent, true);
    assert.equal(retry.resumption.resumedRevision, resumed.thread.revision);
    const sealRetry = await checkpoints.seal(state.db, { ...state.scope,
      checkpointId: 'checkpoint-resume', context: { cursor: 11 },
      evidenceRefs: ['proof:pending'] });
    assert.equal(sealRetry.idempotent, true);
    assert.equal((await state.db.get(`SELECT COUNT(*) AS count
      FROM cell_thread_checkpoint_resumptions`)).count, 1);
  } finally { await state.db.close(); }
});

test('resume refuses stale or corrupted checkpoints and non-resumable success', async () => {
  const state = await fixture();
  try {
    await checkpoints.seal(state.db, { ...state.scope,
      checkpointId: 'checkpoint-stale', context: { cursor: 1 }, evidenceRefs: [] });
    await threads.transition(state.db, { ...state.scope, status: 'active' });
    await assert.rejects(checkpoints.resume(state.db, {
      ...state.scope, checkpointId: 'checkpoint-stale', runtimeControl: provingRuntime()
    }), (error) => error.code === 'CELL_CHECKPOINT_STALE');
    await threads.transition(state.db, { ...state.scope, status: 'completed_execution' });
    await assert.rejects(checkpoints.seal(state.db, { ...state.scope,
      checkpointId: 'checkpoint-success', context: {}, evidenceRefs: [] }),
    (error) => error.code === 'CELL_CHECKPOINT_STATE_NOT_RESUMABLE');

    const other = await fixture();
    try {
      await checkpoints.seal(other.db, { ...other.scope,
        checkpointId: 'checkpoint-corrupt', context: { cursor: 3 }, evidenceRefs: [] });
      await other.db.exec('DROP TRIGGER cell_thread_checkpoint_immutable_update');
      await other.db.run(`UPDATE cell_thread_checkpoints SET context_json = '{"cursor":4}'
        WHERE checkpoint_id = 'checkpoint-corrupt'`);
      await assert.rejects(checkpoints.get(other.db, {
        ...other.scope, checkpointId: 'checkpoint-corrupt'
      }), (error) => error.code === 'CELL_CHECKPOINT_INTEGRITY_FAILED');
    } finally { await other.db.close(); }
  } finally { await state.db.close(); }
});
