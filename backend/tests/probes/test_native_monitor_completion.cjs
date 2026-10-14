'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'native-monitor-completion-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_SKIP_BOOT_DB_BACKUP = '1';
process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
process.env.GENOS_ADMIN_TOKEN = crypto.randomBytes(24).toString('hex');
const { getDatabase, closeDatabase } = require('../../src/db');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-monitor-oracle-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  process.env.GENOS_DB_PATH = path.join(root, 'monitor.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await require('../../tests/test_bounded_worker_delegation').seed(db, workspace);
    const methodContract = { version: 1, methodId: 'monitor_samples', parameters: {
      territoryId: 'territory-regulation', threshold: 10, samples: [
        { value: 12, sourceRef: 'sample://high', observedAt: '2026-10-10T10:00:00Z' },
        { value: 5, sourceRef: 'sample://normal', observedAt: '2026-10-10T10:01:00Z' } ] } };
    const budget = { tokens: 5000, events: 80, latencyMs: 60000 };
    const workers = await require('../../src/services/agentFleetWorkers').createAutonomousWorkers(db,
      { id: 'delegation-root', agent_type: 'GenOS' }, {
        plan: { strategyContract: { primary: 'tree-search' }, tokenPolicy: { total: 5000,
          workerShare: 0.6, orchestratorReserve: 0.4, allocation: 'fixed' },
        dispatchWorkers: [{ workerId: 'monitor-resident', role: 'resident_daemon', workerKind: 'resident_daemon',
          label: 'regulation-monitor', hypothesis: 'Measure the bounded territory sample window.',
          capabilities: [], methodContract }] },
        mission: { missionId: 'delegation-mission', prompt: 'Measure referenced territory samples.',
          workspaceRoot: workspace, workspaceProvisioned: true, executionPolicy: { allowFileEdits: false },
          executionBudget: budget, timeoutMs: 60000, executor: 'local', localRuntime: true }
      });
    const worker = workers[0];
    await require('../../src/services/missionIdentityService').attachAgent(db,
      { missionId: 'delegation-mission', agentId: worker.agentId, role: worker.role });
    const metadata = JSON.parse((await db.get('SELECT metadata_json FROM agents WHERE id=?', worker.agentId)).metadata_json);
    await require('../../src/services/agentRuntimeAdapter').startMission({ agentId: worker.agentId,
      missionId: 'delegation-mission',
      orchestratorAgentId: 'delegation-root', role: worker.role, workerKind: 'resident_daemon',
      workerContract: metadata.workerContract, methodContract, prompt: worker.prompt,
      workspaceId: worker.workspaceId, workspaceRoot: worker.workspaceRoot, workspaceProvisioned: true,
      executor: 'local', localRuntime: true, timeoutMs: 60000, executionBudget: budget,
      executionPolicy: { allowFileEdits: false } });
    let row;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      row = await db.get('SELECT id,status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', worker.agentId);
      if (['completed', 'blocked', 'failed', 'error'].includes(row?.status)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(row, 'worker did not persist an execution run');
    assert.equal(row.status, 'completed', JSON.stringify(row));
    assert.equal(row.status, 'completed');
    const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, row.id);
    const request = { runId: row.id, agentId: worker.agentId, scope: authority.envelope.scope };
    const attestation = await require('../../src/services/epistemic/nativeOracleJournal').read(db,
      { ...request, kind: 'attestation' });
    assert.equal(attestation.value.domain, 'monitor_window');
    assert.equal(attestation.value.accepted, true);
    assert.equal(attestation.value.costs.processes, 2);
    const assembly = await require('../../src/services/aeisAssemblyStore').readAssembly(db, attestation.value.assemblyId);
    assert.deepEqual(assembly.evaluation.assembly.verifications.map(item => item.status), ['verified', 'verified']);
    assert.equal(new Set(assembly.evaluation.assembly.verifications.map(item =>
      item.executionEvidence[0].processId)).size, 2);
    assert.equal((await require('../../src/services/biologicalWorkerStore').receipt(db, row.id)).result.verified, true);
    process.stdout.write(JSON.stringify({ schema: 'genos.native-monitor-completion/v1',
      runId: row.id, workerId: worker.agentId, status: row.status, independentVerifiers: 2 }) + '\n');
  } finally {
    await require('../../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
