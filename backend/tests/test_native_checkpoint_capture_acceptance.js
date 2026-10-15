'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const episodeRuntime = require('../src/services/missionEpisodeRuntime');
const cells = require('../src/services/workerCellThreadRuntime');
const threads = require('../src/services/cellThreadService');
const checkpoints = require('../src/services/cellThreadCheckpointService');
const studio = require('../src/services/studioManagedCellService');
const cooperative = require('../src/services/cooperativeRuntimeControl');
const capability = require('../src/services/runtimeControlCapability');
const { activeProcesses } = require('../src/services/agentOrchestrationState');

process.env.GENOS_OPERATOR_CONTROL_TIMEOUT_MS = '250';
const helper = path.join(__dirname, 'helpers', 'native_checkpoint_capture_child.cjs');
const prompt = 'native checkpoint capture prompt';

function generated(reply = 'reply-owned-by-the-runtime') {
  return { kind: 'genos-local-runtime', version: 1, phase: 'generated',
    promptHash: crypto.createHash('sha256').update(prompt).digest('hex'), reply };
}

async function fixture(runtimeContext = generated()) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT,
      execution_mode TEXT, parent_agent_id TEXT);
    CREATE TABLE access_keys (id TEXT PRIMARY KEY, is_active INTEGER,
      expires_at TEXT, role TEXT);
    CREATE TABLE strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
      version INTEGER NOT NULL, contract_hash TEXT NOT NULL);
    CREATE TABLE agent_runtime_state (id TEXT PRIMARY KEY, agent_id TEXT UNIQUE,
      workspace_id TEXT, status TEXT, current_task TEXT, reason TEXT,
      state_json TEXT, updated_at TEXT);
    INSERT INTO missions VALUES ('mission-native-capture', 'capture', 'active');
    INSERT INTO workspaces VALUES ('workspace-native-capture',
      'org-native-capture', 'project-native-capture');
    INSERT INTO agents VALUES ('orchestrator-native-capture',
      'workspace-native-capture', 'orchestrator', NULL);
    INSERT INTO agents VALUES ('worker-native-capture',
      'workspace-native-capture', 'worker', 'orchestrator-native-capture');
    INSERT INTO access_keys VALUES ('operator-native-capture', 1, NULL, 'admin');
    INSERT INTO strategy_contracts VALUES ('strategy-native-capture',
      'orchestrator-native-capture', 1, 'sha256:contract');`);
  const root = await episodeRuntime.ensure(db, {
    missionId: 'mission-native-capture', orchestratorId: 'orchestrator-native-capture',
    action: 'orchestrate', request: {}
  });
  const runtime = await cells.ensureDispatched(db, {
    missionId: 'mission-native-capture', orchestratorId: 'orchestrator-native-capture',
    workerId: 'worker-native-capture', missionScope: { available: true,
      episodeId: root.episodeId, rootThreadId: root.rootThreadId }
  });
  const scope = { organizationId: 'org-native-capture',
    projectId: 'project-native-capture', missionId: 'mission-native-capture',
    episodeId: root.episodeId, threadId: runtime.threadId,
    workerId: 'worker-native-capture' };
  const stateJson = JSON.stringify({ workspaceId: 'workspace-native-capture',
    status: runtimeContext.phase, checkpoint: runtimeContext });
  await db.run(`INSERT INTO agent_runtime_state VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    'runtime-state-native-capture', scope.workerId, 'workspace-native-capture',
    runtimeContext.phase, 'capture', 'local-runtime-checkpoint', stateJson);
  return { db, scope, runtimeContext };
}

function waitFor(child, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Timed out waiting for child.')), timeoutMs);
    const onMessage = message => { if (predicate(message)) done(null, message); };
    const onExit = () => done(new Error('Child exited before expected message.'));
    function done(error, value) {
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('exit', onExit);
      if (error) reject(error); else resolve(value);
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
  });
}

async function spawnBound(state) {
  const child = fork(helper, [], { silent: true });
  child.genosControlIdentity = state.scope;
  capability.bind(child);
  const ready = waitFor(child, message => message?.type === capability.READY_TYPE);
  child.send({ type: 'fixture-bind', lineage: state.scope, context: state.runtimeContext });
  await ready;
  activeProcesses.set(state.scope.workerId, child);
  return { child, safePoint: null };
}

async function spawnPaused(state) {
  const processState = await spawnBound(state);
  const { child } = processState;
  const pausing = cooperative.request({ child, action: 'pause', lineage: state.scope });
  const safePoint = waitFor(child, message => message?.callId === 'capture-safe-point');
  child.send({ type: 'fixture-safe-point', callId: 'capture-safe-point', phase: 'generated' });
  assert.equal((await pausing).proven, true);
  await threads.transition(state.db, { ...state.scope, status: 'active' });
  await threads.transition(state.db, { ...state.scope, status: 'waiting_signal' });
  return { child, safePoint };
}

async function close(state, processState) {
  activeProcesses.delete(state.scope.workerId);
  if (processState.child.connected) processState.child.disconnect();
  if (processState.safePoint) await processState.safePoint.catch(() => {});
  if (processState.child.exitCode === null) processState.child.kill();
  await state.db.close();
}

function sealInput(state, body = {}) {
  return { scope: { organizationId: state.scope.organizationId,
    projectId: state.scope.projectId }, missionId: state.scope.missionId,
  episodeId: state.scope.episodeId, threadId: state.scope.threadId,
  authMethod: 'access_key', actorId: 'operator-native-capture',
  body: { idempotencyKey: 'native-capture-key', ...body } };
}

test('managed sealing ignores forged client context and keeps the runtime paused', async () => {
  const state = await fixture();
  const processState = await spawnPaused(state);
  try {
    const result = await studio.sealCheckpoint(state.db, sealInput(state, {
      context: { forged: true }, evidenceRefs: ['client:untrusted']
    }));
    assert.deepEqual(result.checkpoint.context, state.runtimeContext);
    assert.equal(result.checkpoint.evidenceRefs.includes('client:untrusted'), false);
    assert.ok(result.checkpoint.evidenceRefs.some(ref => ref.startsWith('agent-runtime-state:')));
    const pending = Symbol('pending');
    assert.equal(await Promise.race([processState.safePoint,
      new Promise(resolve => setTimeout(() => resolve(pending), 40))]), pending);

    const repeated = await studio.sealCheckpoint(state.db, sealInput(state, {
      context: { anotherForgery: true }
    }));
    assert.equal(repeated.idempotent, true);
    assert.equal((await state.db.get('SELECT COUNT(*) count FROM cell_thread_checkpoints')).count, 1);
  } finally { await close(state, processState); }
});

test('persisted context tamper and cross-tenant scope produce no checkpoint', async () => {
  const state = await fixture();
  const processState = await spawnPaused(state);
  try {
    const tampered = { ...state.runtimeContext, reply: 'database-only-tamper' };
    await state.db.run(`UPDATE agent_runtime_state SET state_json = ?`,
      JSON.stringify({ workspaceId: 'workspace-native-capture', status: 'generated',
        checkpoint: tampered }));
    await assert.rejects(studio.sealCheckpoint(state.db, sealInput(state)),
      error => error.code === 'RUNTIME_CHECKPOINT_PERSISTENCE_DIVERGENT');
    await assert.rejects(studio.sealCheckpoint(state.db, {
      ...sealInput(state), scope: { organizationId: 'org-other',
        projectId: state.scope.projectId }
    }));
    assert.equal((await state.db.get('SELECT COUNT(*) count FROM cell_thread_checkpoints')).count, 0);
  } finally { await close(state, processState); }
});

test('non-generated and oversized native contexts fail without false success', async t => {
  for (const [name, runtimeContext] of [
    ['prepared', { kind: 'genos-local-runtime', version: 1, phase: 'prepared',
      promptHash: generated().promptHash, reply: null }],
    ['evaluated', { ...generated(), phase: 'evaluated' }],
    ['oversized', generated('x'.repeat(256 * 1024 + 1))]
  ]) {
    await t.test(name, async () => {
      const state = await fixture(runtimeContext);
      const processState = await spawnPaused(state);
      try {
        await assert.rejects(studio.sealCheckpoint(state.db, sealInput(state)));
        assert.equal((await state.db.get(
          'SELECT COUNT(*) count FROM cell_thread_checkpoints')).count, 0);
      } finally { await close(state, processState); }
    });
  }
});

test('an active non-paused CellThread cannot be captured', async () => {
  const state = await fixture();
  const processState = await spawnBound(state);
  try {
    await threads.transition(state.db, { ...state.scope, status: 'active' });
    await assert.rejects(studio.sealCheckpoint(state.db, sealInput(state)),
      error => error.code === 'RUNTIME_CHECKPOINT_THREAD_NOT_QUIESCENT');
    assert.equal((await state.db.get('SELECT COUNT(*) count FROM cell_thread_checkpoints')).count, 0);
  } finally { await close(state, processState); }
});

test('a crash window after capture cannot be returned as a sealed checkpoint', async () => {
  const state = await fixture();
  const processState = await spawnPaused(state);
  const crashWindow = studio.create({ checkpoints: { ...checkpoints,
    seal: async () => { throw Object.assign(new Error('simulated commit loss'),
      { code: 'SIMULATED_COMMIT_LOSS' }); } } });
  try {
    await assert.rejects(crashWindow.sealCheckpoint(state.db, sealInput(state)),
      error => error.code === 'SIMULATED_COMMIT_LOSS');
    assert.equal((await state.db.get('SELECT COUNT(*) count FROM cell_thread_checkpoints')).count, 0);
  } finally { await close(state, processState); }
});
