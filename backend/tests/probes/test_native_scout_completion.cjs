'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'native-scout-completion-test-only';
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-scout-oracle-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Check timeout=30 in fixture source.');
  process.env.GENOS_DB_PATH = path.join(root, 'scout.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await require('../../tests/test_bounded_worker_delegation').seed(db, workspace);
    const methodContract = { version: 1, methodId: 'scan_literal', parameters: {
      sources: [{ sourceRef: 'fixture://timeout', text: 'timeout=30' }], terms: ['timeout', 'missing'] } };
    const result = await require('../../src/services/agents/subOrchestratorDispatchService')
      .dispatchSubOrchestratorWorker(db, 'delegation-sub', { mission: 'Find the literal timeout value.',
        workerKind: 'scout_cell', methodContract, timeoutMs: 60000 });
    if (!result.success) {
      const row = await db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
      const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, row.id);
      const attestation = await require('../../src/services/epistemic/nativeOracleJournal').read(db,
        { runId: row.id, agentId: result.childAgentId, scope: authority.envelope.scope, kind: 'attestation' });
      const assembly = attestation && await db.get('SELECT * FROM aeis_assurance_assemblies WHERE id=?', attestation.value.assemblyId);
      const verification = assembly && JSON.parse(assembly.payload_json).assembly.verifications
        .map(item => ({ status: item.status, postconditions: item.executionEvidence?.[0]?.postconditions }));
      const metadata = await db.get('SELECT metadata_json FROM agents WHERE id=?', result.childAgentId);
      const boundMethod = JSON.parse(metadata.metadata_json).workerContract.mission.methodContract;
      process.stderr.write(JSON.stringify({ result, row, attestation: attestation?.value, verification,
        boundMethod,
        events: await db.all('SELECT event_type,payload_json FROM telemetry_events WHERE agent_id=? ORDER BY rowid DESC LIMIT 8', result.childAgentId) }) + '\n');
    }
    assert.equal(result.success, true, JSON.stringify(result));
    const row = await db.get('SELECT id,status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
    assert.equal(row.status, 'completed');
    const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, row.id);
    const journal = require('../../src/services/epistemic/nativeOracleJournal');
    const request = { runId: row.id, agentId: result.childAgentId, scope: authority.envelope.scope };
    const attestation = await journal.read(db, { ...request, kind: 'attestation' });
    assert.equal(attestation.value.domain, 'scan_literal');
    assert.equal(attestation.value.accepted, true);
    assert.equal(attestation.value.costs.processes, 2);
    const assembly = await require('../../src/services/aeisAssemblyStore').readAssembly(db, attestation.value.assemblyId);
    assert.deepEqual(assembly.evaluation.assembly.verifications.map(item => item.status), ['verified', 'verified']);
    assert.equal(new Set(assembly.evaluation.assembly.verifications.map(item =>
      item.executionEvidence[0].processId)).size, 2);
    assert.equal((await require('../../src/services/biologicalWorkerStore').receipt(db, row.id)).result.verified, true);
    process.stdout.write(JSON.stringify({ schema: 'genos.native-scout-completion/v1',
      runId: row.id, workerId: result.childAgentId, status: row.status, independentVerifiers: 2 }) + '\n');
  } finally {
    await require('../../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
