'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testDbPath = path.join(os.tmpdir(), `genos-topology-worker-${Date.now()}.db`);
process.env.GENOS_DB_PATH = testDbPath;
process.env.GENOS_ADMIN_PASSWORD = 'topology-worker-suite-only';
process.env.GENOS_ADMIN_TOKEN = 'topology-worker-suite-token';
const database = require('../src/db');
const { ensureTopologyWorker } = require('../src/services/topologyWorkerPersistenceService');
const { persistWorkerIdentity } = require('../src/services/topology/workerLauncher.cjs');

function fakeDb() {
  const agents = new Map();
  const garageClaims = new Set();
  let startRunningDuringUpdate = false;
  return {
    agents,
    garageClaims,
    set startRunningDuringUpdate(value) { startRunningDuringUpdate = value; },
    async get(sql, id) {
      if (sql.includes('FROM garage_queue')) return garageClaims.has(id) ? { request_id: 'claim-test' } : null;
      return agents.get(id) || null;
    },
    async run(sql, ...values) {
      if (sql.includes('UPDATE agents SET metadata_json')) {
        const [metadataJson, id] = values;
        const existing = agents.get(id);
        if (startRunningDuringUpdate) {
          startRunningDuringUpdate = false;
          existing.status = 'running';
          return { changes: 0 };
        }
        existing.metadata_json = metadataJson;
        return { changes: 1 };
      }
      const [id, name, role, workspaceId, modelTier, isolationMode, parentId, about, currentTask, metadataJson] = values;
      agents.set(id, {
        id, name, role, workspace_id: workspaceId, model_tier: modelTier,
        isolation_mode: isolationMode, parent_agent_id: parentId, about, current_task: currentTask,
        execution_mode: 'worker', status: 'idle', metadata_json: metadataJson
      });
      return { changes: 1 };
    }
  };
}

async function main() {
  const db = fakeDb();
  const identity = {
    workerId: 'worker_topology_1', parentId: 'orchestrator_1', workspaceId: null,
    role: 'implementation', mission: 'Inspect the API migration.', topologySessionId: 'syncytium-session-1'
  };
  assert.deepEqual(await ensureTopologyWorker(db, identity), { workerId: identity.workerId, created: true });
  const row = db.agents.get(identity.workerId);
  assert.equal(row.parent_agent_id, identity.parentId);
  assert.equal(row.execution_mode, 'worker');
  assert.equal(row.about, `Worker scope: ${identity.mission}`);
  assert.equal(JSON.parse(row.metadata_json).workerKind, 'bounded_worker');
  assert.equal(JSON.parse(row.metadata_json).topologySessionId, identity.topologySessionId);
  await persistWorkerIdentity({ db, context: { orchestratorId: 'orchestrator_1', task: 'Inspect biome',
    request: { mode: 'biome' }, topologySession: { sessionId: 'biome-1' } },
  member: { role: 'implementation', executionBudgetTokens: 20000 }, parent: { workspace_id: 'workspace-1', isolation_mode: 'Branch',
    model_tier: 'standard' }, workerId: 'biome-worker' });
  assert.equal(JSON.parse(db.agents.get('biome-worker').metadata_json).topologySessionId, 'biome-1');
  assert.equal(JSON.parse(db.agents.get('biome-worker').metadata_json).workerContract.resources.maxTokens, 20000);
  assert.deepEqual(await ensureTopologyWorker(db, identity), { workerId: identity.workerId, created: false });
  const unscopedSession = { ...identity, topologySessionId: undefined };
  assert.deepEqual(await ensureTopologyWorker(db, unscopedSession), { workerId: identity.workerId, created: false });
  const unscopedMetadata = JSON.parse(db.agents.get(identity.workerId).metadata_json);
  assert.equal(unscopedMetadata.topologySessionId, null, 'A rebind without a session must clear the old metadata link.');
  assert.equal(unscopedMetadata.workerContract.mission.topologySessionId, null, 'The worker contract and metadata must agree on session scope.');
  await ensureTopologyWorker(db, identity);
  const originalMetadata = db.agents.get(identity.workerId).metadata_json;
  await assert.rejects(
    () => ensureTopologyWorker(db, { ...identity, workspaceId: 'workspace-B' }),
    (error) => error.code === 'TOPOLOGY_WORKER_IDENTITY_CONFLICT'
  );
  assert.equal(db.agents.get(identity.workerId).metadata_json, originalMetadata, 'A worker from another workspace must not be rebound.');
  const changedSession = { ...identity, topologySessionId: 'replacement-session', methodContract: { version: 1, methodId: 'prompt_defined' } };
  db.agents.get(identity.workerId).status = 'running';
  await assert.rejects(() => ensureTopologyWorker(db, changedSession), (error) => error.code === 'TOPOLOGY_WORKER_BUSY');
  assert.equal(db.agents.get(identity.workerId).metadata_json, originalMetadata, 'A running worker contract must remain unchanged.');
  db.agents.get(identity.workerId).status = 'idle';
  db.garageClaims.add(identity.workerId);
  await assert.rejects(() => ensureTopologyWorker(db, changedSession), (error) => error.code === 'TOPOLOGY_WORKER_BUSY');
  assert.equal(db.agents.get(identity.workerId).metadata_json, originalMetadata, 'A worker with an active Garage claim must remain unchanged.');
  db.garageClaims.delete(identity.workerId);
  db.startRunningDuringUpdate = true;
  await assert.rejects(() => ensureTopologyWorker(db, changedSession), (error) => error.code === 'TOPOLOGY_WORKER_BUSY');
  assert.equal(db.agents.get(identity.workerId).metadata_json, originalMetadata, 'The conditional update must close the status race.');
  db.agents.get(identity.workerId).status = 'idle';
  await assert.rejects(
    () => ensureTopologyWorker(db, { ...identity, parentId: 'other_parent' }),
    (error) => error.code === 'TOPOLOGY_WORKER_IDENTITY_CONFLICT'
  );
  await assertDatabaseBusyGuard();
  console.log('Topology worker identity persistence: PASS');
}

async function assertDatabaseBusyGuard() {
  const db = await database.getDatabase();
  const input = {
    workerId: 'worker_topology_db', parentId: 'orchestrator_db', role: 'implementation',
    mission: 'Verify persisted worker leases.', topologySessionId: 'original-session'
  };
  try {
    await db.run("INSERT INTO agents (id, name, role, status) VALUES (?, 'Topology parent', 'orchestrator', 'idle')", input.parentId);
    await ensureTopologyWorker(db, input);
    const initial = await db.get('SELECT metadata_json FROM agents WHERE id = ?', input.workerId);
    await db.run("UPDATE agents SET status = 'running' WHERE id = ?", input.workerId);
    await assert.rejects(
      () => ensureTopologyWorker(db, { ...input, topologySessionId: 'replacement-session' }),
      (error) => error.code === 'TOPOLOGY_WORKER_BUSY'
    );
    let current = await db.get('SELECT metadata_json FROM agents WHERE id = ?', input.workerId);
    assert.equal(current.metadata_json, initial.metadata_json);
    await db.run("UPDATE agents SET status = 'idle' WHERE id = ?", input.workerId);
    await db.run(`INSERT INTO garage_queue (request_id, orchestrator_id, worker_id, status, phase)
      VALUES ('claim-topology-worker-db', ?, ?, 'claimed', 'ready')`, input.parentId, input.workerId);
    await assert.rejects(
      () => ensureTopologyWorker(db, { ...input, topologySessionId: 'queued-session' }),
      (error) => error.code === 'TOPOLOGY_WORKER_BUSY'
    );
    current = await db.get('SELECT metadata_json FROM agents WHERE id = ?', input.workerId);
    assert.equal(current.metadata_json, initial.metadata_json);
    await db.run('DELETE FROM garage_queue WHERE request_id = ?', 'claim-topology-worker-db');
  } finally {
    await database.closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (_) {}
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
