'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const { seed } = require('./test_bounded_worker_delegation');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-specialist-delegation-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  process.env.GENOS_DB_PATH = path.join(root, 'delegation.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await seed(db, workspace);
    const methodContract = require('./helpers/nativeWorkerFixtures').fixtures(workspace).specialist;
    const result = await require('../src/services/agents/subOrchestratorDispatchService')
      .dispatchSubOrchestratorWorker(db, 'delegation-sub', {
        mission: 'Solve the assigned scheduling problem.', workerKind: 'specialist',
        methodContract, specialtyNiche: 'scheduling', timeoutMs: 120000
      });
    const run = await db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1',
      result.childAgentId);
    assert.equal(result.success, true, JSON.stringify({ result, run }));
    assert.equal(run.status, 'completed');
    const child = await db.get('SELECT metadata_json FROM agents WHERE id=?', result.childAgentId);
    const contract = JSON.parse(child.metadata_json).workerContract;
    assert.equal(contract.identity.workerKind, 'specialist');
    assert.equal(contract.mission.specialtyNiche, 'scheduling');
    assert.deepEqual(contract.mission.methodContract, methodContract);
    assert.equal((await require('../src/services/biologicalWorkerStore').receipt(db, run.id)).result.verified, true);
    console.log('Sub-orchestrator delegates a complete specialist contract through verified completion.');
  } finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
