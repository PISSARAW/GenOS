'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const api = require('../src/services/metapopulationCoordinationService');
const store = require('../src/services/metapopulation/metapopulationStore');
const runtime = require('../src/services/metapopulation/runtime/regionalRuntimeService');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');

async function expectCode(work, code) {
  await assert.rejects(work, (error) => error.code === code);
}

async function seedIdentity(db, root) {
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT, runtime_pid INTEGER);
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT, orchestrator_agent_id TEXT);
    CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT, role TEXT);
    INSERT INTO agents VALUES ('agent-1', 'workspace-1', 'idle', NULL);
    INSERT INTO missions VALUES ('agent-1', 'Regional recovery', 'agent-1');
    INSERT INTO mission_agents VALUES ('agent-1', 'agent-1', 'orchestrator');`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)', 'workspace-1', root, 'org-1', 'project-1');
  await migrateMetapopulationRuntime(db);
}

function probeAdapters(execute) {
  return {
    observe: async () => ({ revision: 1 }),
    diagnose: async () => ({ status: 'STABLE' }),
    plan: async () => ({ actions: [{ type: 'EXECUTE_PROBE' }] }),
    execute,
    verify: async () => ({ valid: true })
  };
}

async function crashDuringExecuteResumesSameCycle(db) {
  const session = await api.createMetapopulationSession('Resume after EXECUTE interruption.',
    { db, variant: 'balanced', orchestratorId: 'agent-1' });
  const first = await runtime.runRegionalRuntime({ metapopulationId: session.sessionId }, {
    db, adapters: probeAdapters(async () => ({ completed: true }))
  });
  assert.equal(first.cycles[0].cycle, 1);
  assert.equal(first.cycles[0].status, 'VERIFIED');

  const interrupted = await runtime.runRegionalRuntime({ metapopulationId: session.sessionId, resume: true }, {
    db, adapters: probeAdapters(async (...args) => {
      const input = args[3];
      assert.equal(input.cycle, 2);
      throw Object.assign(new Error('simulated runner interruption'), { code: 'RUNNER_INTERRUPTED' });
    })
  });
  assert.equal(interrupted.status, 'HALTED');
  assert.equal(interrupted.cycles[0].reason, 'RUNNER_INTERRUPTED');
  assert.equal((await runtime.getLastVerifiedCycle(db, session.sessionId)).cycle, 1);

  const resumed = await api.runAutonomousRegionalRuntime({
    metapopulationId: session.sessionId, resume: true, maxCycles: 1
  }, { db });
  assert.equal(resumed.cycles.length, 1);
  assert.equal(resumed.cycles[0].cycle, 2, 'the interrupted cycle must not be skipped');
}

async function attachSnapshotDeme(db, sessionId, root) {
  await api.createPatch(sessionId, { patchId: 'patch-snapshot', environment: {}, requirements: [],
    resources: {}, carryingCapacity: 2, quality: 1, accessibility: 1 }, { db });
  await api.createDeme(sessionId, { demeId: 'deme-snapshot', patchId: 'patch-snapshot',
    members: ['agent-1'] }, { db });
  await store.attachDemeWorkspace(db, { metapopulationId: sessionId, demeId: 'deme-snapshot',
    workspacePath: path.join(root, 'deme-snapshot'), workspaceOwnerId: 'agent-1', localBoundary: [], budget: {} });
}

async function insertInFlightCycle(db, sessionId) {
  await db.run(`INSERT INTO metapopulation_cycle_states
    (state_id, metapopulation_id, cycle, seed, observed_json, diagnosis_json, plan_json,
     execution_json, verification_json, status, created_at)
    VALUES (?, ?, 1, 'snapshot-seed', '{}', '{}', '{"actions":[{"type":"EXECUTE_PROBE"}]}',
      '{"completed":false,"stage":"EXECUTE"}', '{}', 'RESUMED', ?)`,
  'in-flight-snapshot', sessionId, new Date().toISOString());
}

async function quiescentSnapshotRefusesInFlightEffect(db, root) {
  const session = await api.createMetapopulationSession('Quiescent snapshot recovery.',
    { db, variant: 'rescue_network', orchestratorId: 'agent-1' });
  await attachSnapshotDeme(db, session.sessionId, root);
  await insertInFlightCycle(db, session.sessionId);
  const input = { db, sessionId: session.sessionId, agentId: 'agent-1', workspaceId: 'workspace-1' };

  await expectCode(() => api.quiesceForSnapshot(input), 'METAPOPULATION_SNAPSHOT_IN_FLIGHT');
  assert.equal((await db.get('SELECT status FROM metapopulation_sessions WHERE id = ?', session.sessionId)).status,
    'FORMING', 'a refused snapshot must roll back the tentative quiescence transition');

  await db.run("UPDATE metapopulation_cycle_states SET status = 'FAILED' WHERE state_id = 'in-flight-snapshot'");
  const snapshot = await api.quiesceForSnapshot(input);
  assert.equal(snapshot.status, 'QUIESCENT');
  assert.equal(snapshot.boundaryVerified, true);
  assert.equal(snapshot.missionVerified, false);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const root = path.resolve(process.cwd());
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await seedIdentity(db, root);
    await crashDuringExecuteResumesSameCycle(db);
    await quiescentSnapshotRefusesInFlightEffect(db, root);
  } finally {
    await db.close();
  }
  console.log('Metapopulation crash recovery and quiescent snapshot: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
