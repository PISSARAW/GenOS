'use strict';

const assert = require('node:assert/strict');
const { ensureTopologyWorker } = require('../src/services/topologyWorkerPersistenceService');

function fakeDb() {
  const agents = new Map();
  return {
    agents,
    async get(_sql, id) { return agents.get(id) || null; },
    async run(_sql, ...values) {
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
    role: 'backend_engineer', mission: 'Inspect the API migration.'
  };
  assert.deepEqual(await ensureTopologyWorker(db, identity), { workerId: identity.workerId, created: true });
  const row = db.agents.get(identity.workerId);
  assert.equal(row.parent_agent_id, identity.parentId);
  assert.equal(row.execution_mode, 'worker');
  assert.equal(row.about, `Worker scope: ${identity.mission}`);
  assert.equal(JSON.parse(row.metadata_json).workerKind, 'bounded_worker');
  assert.deepEqual(await ensureTopologyWorker(db, identity), { workerId: identity.workerId, created: false });
  await assert.rejects(
    () => ensureTopologyWorker(db, { ...identity, parentId: 'other_parent' }),
    (error) => error.code === 'TOPOLOGY_WORKER_IDENTITY_CONFLICT'
  );
  console.log('Topology worker identity persistence: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
