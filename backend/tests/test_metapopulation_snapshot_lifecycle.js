'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const api = require('../src/services/metapopulationCoordinationService');
const store = require('../src/services/metapopulation/metapopulationStore');
const snapshots = require('../src/services/topologySnapshotService');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');

snapshots.registerAdapter('metapopulation', require('../src/services/topologySnapshots/metapopulation'));

async function expectCode(work, code) {
  await assert.rejects(work, (error) => error.code === code);
}

async function seedIdentity(db, root) {
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT, runtime_pid INTEGER);
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT, orchestrator_agent_id TEXT);
    CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT, role TEXT);
    INSERT INTO agents VALUES ('agent-1', 'workspace-1', 'idle', NULL);
    INSERT INTO missions VALUES ('agent-1', 'Regional mission', 'agent-1');
    INSERT INTO mission_agents VALUES ('agent-1', 'agent-1', 'orchestrator');`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)', 'workspace-1', root, 'org-1', 'project-1');
  await migrateMetapopulationRuntime(db);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const root = path.resolve(process.cwd());
  try {
    await seedIdentity(db, root);
    const session = await api.createMetapopulationSession('Regional recovery.',
      { db, variant: 'rescue_network', orchestratorId: 'agent-1' });
    assert.equal(session.missionId, 'agent-1');
    const input = { db, sessionId: session.sessionId, agentId: 'agent-1', workspaceId: 'workspace-1' };
    await expectCode(() => api.quiesceForSnapshot(input), 'METAPOPULATION_SNAPSHOT_DEME_MISMATCH');
    await api.createPatch(session.sessionId, { patchId: 'patch-1', environment: {}, requirements: [],
      resources: {}, carryingCapacity: 2, quality: 1, accessibility: 1 }, { db });
    await api.createDeme(session.sessionId, { demeId: 'deme-1', patchId: 'patch-1',
      members: ['agent-1'] }, { db });
    await store.attachDemeWorkspace(db, { metapopulationId: session.sessionId, demeId: 'deme-1',
      workspacePath: path.join(root, 'deme-1'), workspaceOwnerId: 'agent-1', localBoundary: [], budget: {} });
    await db.run("UPDATE agents SET status = 'running' WHERE id = 'agent-1'");
    await expectCode(() => api.quiesceForSnapshot(input), 'METAPOPULATION_QUIESCENCE_WORKERS_ACTIVE');
    await db.run("UPDATE agents SET status = 'idle' WHERE id = 'agent-1'");
    const ready = await api.quiesceForSnapshot(input);
    assert.equal(ready.boundaryVerified, true);
    assert.equal(ready.missionVerified, false);
    const manifest = await snapshots.capture({ ...input, scope: { clause: 'w.organization_id = ?', params: ['org-1'] },
      topologyId: 'metapopulation', variantId: 'rescue_network' });
    assert.equal(manifest.boundary.status, 'QUIESCENT');
    assert.equal((await snapshots.preflightRestore({ ...input,
      scope: { clause: 'w.organization_id = ?', params: ['org-1'] },
      topologyId: 'metapopulation', variantId: 'rescue_network', manifest })).restorable, false);
    const repeated = await api.quiesceForSnapshot(input);
    assert.equal(repeated.revision, ready.revision);
    const isolatedOwner = 'metapop-deme-test';
    await db.run('UPDATE metapopulation_demes SET workspace_owner_id = ?, workspace_path = ? WHERE deme_id = ?',
      isolatedOwner, path.join(path.dirname(root), '.genos-agent-worlds', isolatedOwner), 'deme-1');
    const isolated = await api.quiesceForSnapshot(input);
    assert.equal(isolated.boundaryVerified, true);
    console.log('Metapopulation quiescence and normal-session snapshot: PASS');
  } finally { await db.close(); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
