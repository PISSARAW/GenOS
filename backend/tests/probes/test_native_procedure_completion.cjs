'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'native-procedure-completion-test-only';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_SKIP_BOOT_DB_BACKUP = '1';
process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = require('node:crypto').randomBytes(24).toString('hex');
process.env.GENOS_ADMIN_TOKEN = require('node:crypto').randomBytes(24).toString('hex');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../../src/db');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-procedure-oracle-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  for (const [key, value] of Object.entries({ GENOS_DB_PATH: path.join(root, 'procedure.db'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'), GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_WORKSPACES_ROOT: root, GENOS_DISABLE_WORKSPACE_GC: '1' })) process.env[key] = value;
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await require('../../tests/test_bounded_worker_delegation').seed(db, workspace);
    const methodContract = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
    const budget = { tokens: 5000, events: 80, latencyMs: 60000 };
    const workers = await require('../../src/services/agentFleetWorkers').createAutonomousWorkers(db,
      { id: 'delegation-root', agent_type: 'GenOS' }, { plan: { strategyContract: { primary: 'tree-search' },
        tokenPolicy: { total: 5000, workerShare: 0.6, orchestratorReserve: 0.4, allocation: 'fixed' },
        dispatchWorkers: [{ workerId: 'procedure-native', role: 'procedural_executor',
          workerKind: 'procedural_executor', label: 'subset-solver', hypothesis: 'Compute a witnessed subset sum.',
          capabilities: [], methodContract }] }, mission: { missionId: 'delegation-mission',
        prompt: 'Compute a witnessed subset sum.', workspaceRoot: workspace, workspaceProvisioned: true,
        executionPolicy: { allowFileEdits: false }, executionBudget: budget, timeoutMs: 60000,
        executor: 'local', localRuntime: true } });
    const worker = workers[0];
    await require('../../src/services/missionIdentityService').attachAgent(db,
      { missionId: 'delegation-mission', agentId: worker.agentId, role: worker.role });
    const metadata = JSON.parse((await db.get('SELECT metadata_json FROM agents WHERE id=?', worker.agentId)).metadata_json);
    await require('../../src/services/agentRuntimeAdapter').startMission({ agentId: worker.agentId,
      missionId: 'delegation-mission', orchestratorAgentId: 'delegation-root', role: worker.role,
      workerKind: 'procedural_executor', workerContract: metadata.workerContract, methodContract,
      prompt: worker.prompt, workspaceId: worker.workspaceId, workspaceRoot: worker.workspaceRoot,
      workspaceProvisioned: true, executor: 'local', localRuntime: true, timeoutMs: 60000,
      executionBudget: budget, executionPolicy: { allowFileEdits: false } });
    const row = await waitForRun(db, worker.agentId);
    assert.equal(row.status, 'completed', JSON.stringify(row));
    const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, row.id);
    const request = { runId: row.id, agentId: worker.agentId, scope: authority.envelope.scope };
    const attestation = await require('../../src/services/epistemic/nativeOracleJournal').read(db,
      { ...request, kind: 'attestation' });
    assert.equal(attestation.value.domain, 'subset_sum');
    assert.equal(attestation.value.accepted, true);
    assert.equal(attestation.value.costs.processes, 2);
    const receipt = await require('../../src/services/biologicalWorkerStore').receipt(db, row.id);
    assert.equal(receipt.result.verified, true);
    process.stdout.write(JSON.stringify({ schema: 'genos.native-procedure-completion/v1',
      runId: row.id, workerId: worker.agentId, status: row.status, independentVerifiers: 2 }) + '\n');
  } finally {
    await require('../../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}
async function waitForRun(db, agentId) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const row = await db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', agentId);
    if (['completed', 'blocked', 'failed', 'error'].includes(row?.status)) return row;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Native procedure worker did not reach a terminal run state.');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
