'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'rhizome-oracle-resolution-test-only';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-oracle-receipt-test-only';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { seed } = require('./test_bounded_worker_delegation');
const { scoped } = require('./helpers/nativeWorkerFixtures');
const { getDatabase, closeDatabase } = require('../src/db');
const workerStore = require('../src/services/biologicalWorkerStore');
const resolver = require('../src/services/topologyCompletionAdapters/rhizomeOracleEvidenceResolver');

async function qualifiedRun(db) {
  const dispatched = await require('../src/services/agents/subOrchestratorDispatchService')
    .dispatchSubOrchestratorWorker(db, 'delegation-sub', {
      mission: 'Compute the scoped subset sum', workerKind: 'bounded_worker',
      methodContract: scoped, timeoutMs: 60000
    });
  const row = await db.get(`SELECT id, agent_id, status FROM strategy_execution_runs
    WHERE agent_id=? ORDER BY rowid DESC LIMIT 1`, dispatched.childAgentId);
  assert.equal(row.status, 'completed', JSON.stringify(dispatched));
  const binding = await workerStore.binding(db, row.id);
  const receipt = await workerStore.receipt(db, row.id);
  assert.equal(receipt.result.verified, true);
  return { row, binding, receipt };
}

async function verifyResolution(db, run) {
  const input = { binding: run.binding, receipt: run.receipt,
    missionId: run.receipt.missionId };
  const resolved = await resolver.resolve(db, input);
  assert.equal(resolved.status, 'verified', JSON.stringify(resolved));
  assert.equal(resolved.runId, run.row.id);
  assert.equal(resolved.workerId, run.row.agent_id);
  assert.equal(resolved.missionId, run.receipt.missionId);
  assert.equal(resolved.verifierIds.length, 2);
  assert.equal(new Set(resolved.verifierIds).size, 2);
  assert.ok(resolved.verifierIds.every((id) => id !== run.row.agent_id));
  assert.equal(resolved.evidenceRefs.length, 3);

  const fabricated = structuredClone(run.receipt);
  fabricated.semanticVerification.hash = 'a'.repeat(64);
  fabricated.semanticVerification.acceptanceHash = 'b'.repeat(64);
  assert.deepEqual(await resolver.resolve(db, { ...input, receipt: fabricated }),
    { status: 'failed', reason: 'rhizome_independent_oracle_invalid' });
  assert.deepEqual(await resolver.resolve(db, { ...input, missionId: 'foreign-mission' }),
    { status: 'failed', reason: 'rhizome_independent_oracle_invalid' });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-rhizome-oracle-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Rhizome oracle resolution');
  process.env.GENOS_DB_PATH = path.join(root, 'rhizome-oracle.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await seed(db, workspace);
    await verifyResolution(db, await qualifiedRun(db));
    console.log('Rhizome completion resolves persisted native oracle evidence: PASS');
  } finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
