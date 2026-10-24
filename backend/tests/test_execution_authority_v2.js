'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'execution-authority-v2-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const fixture = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const provenance = require('../src/services/gvxMissionProvenance');
const authority = require('../src/services/missionEnvelopeAuthority');
const launchAuthority = require('../src/services/missionExecutionAuthority');
const migration = require('../src/db/migrations/migrateExecutionAuthorityV2');

async function prepare(db) {
  await fixture.workerSchema(db);
  await db.exec(`ALTER TABLE agents ADD COLUMN status TEXT;
    ALTER TABLE agents ADD COLUMN isolation_mode TEXT;
    ALTER TABLE mission_agents ADD COLUMN role TEXT;
    CREATE TABLE aeis_agent_dissonance (agent_id TEXT PRIMARY KEY, authority_level INTEGER);`);
  const contract = await fixture.addWorker(db);
  await launchAuthority.rotate(db, { missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
  return contract;
}

async function insertHistoricRun(db, contract) {
  await db.run(`INSERT INTO strategy_execution_runs
    (id, agent_id, contract_id, contract_version, status, budget_json, metrics_json)
    VALUES ('historic-run', 'worker', ?, ?, 'completed', '{}', '{}')`, contract.id, contract.version);
  await migration.migrateExecutionAuthorityV2(db);
}

async function assertHistoricReadOnly(db) {
  assert.equal((await migration.classification(db, 'historic-run')).status,
    migration.STATUSES.legacy);
  await assert.rejects(authority.assertRun(db, { agentId: 'worker', runId: 'historic-run' }),
    { code: 'EXECUTION_AUTHORITY_LEGACY_READ_ONLY' });
  const inspected = await authority.inspect(db, { agentId: 'worker', runId: 'historic-run',
    scope: { organizationId: 'org', projectId: 'project' } });
  assert.equal(inspected.status, 'legacy_read_only');
  assert.equal(inspected.current.code, 'EXECUTION_AUTHORITY_LEGACY_READ_ONLY');
}

async function sealV2(db, contract, workspace) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord: contract,
    missionId: 'worker-mission', budget: { tokens: 0, deterministic: true, latencyMs: 300000 } });
  assert.equal((await migration.classification(db, run.id)).status, migration.STATUSES.pending);
  const ctx = { db, agentId: 'worker', executionRun: run, executable: process.execPath,
    contractRecord: contract, autonomyPlan: { mode: 'test' }, normalizedMission: {
      agentId: 'worker', missionId: 'worker-mission', workspaceRoot: workspace,
      workspaceId: 'worker-workspace', toolLease: ['genos_search_failures'], timeoutMs: 300000,
      evidencePolicy: { independentVerifier: true } } };
  const ref = await authority.seal(ctx);
  const saved = await authority.read(db, run.id);
  assert.equal(saved.envelope.schema, authority.SCHEMA);
  assert.match(saved.envelope.inputSnapshot.hash, /^[a-f0-9]{64}$/);
  assert.match(saved.envelope.executable.sha256, /^[a-f0-9]{64}$/);
  assert.equal(saved.envelope.codeRevision.value, saved.envelope.executable.sha256);
  assert.equal(saved.envelope.determinism.enabled, true);
  assert.equal(saved.envelope.evidencePolicy.transportSuccessIsEvidence, false);
  assert.equal(saved.envelope.stateVersions.strategyContract, contract.version);
  assert.deepEqual(Object.keys(saved.envelope.budgets).sort(),
    ['costUsd', 'cpuMs', 'delegationDepth', 'events', 'spawn', 'timeMs', 'tokens']);
  assert.match(saved.envelope.integrity.nonce, /^[a-f0-9]{64}$/);
  assert.match(ref.signature, /^[a-f0-9]{64}$/);
  assert.equal((await migration.classification(db, run.id)).status, migration.STATUSES.bound);
  assert.equal((await authority.assertRun(db, { agentId: 'worker', runId: run.id,
    mission: ctx.normalizedMission, verifyInputs: true, executable: process.execPath })).status, 'authorized');
  await fs.writeFile(path.join(workspace, 'input.txt'), 'changed after seal');
  await assert.rejects(authority.assertRun(db, { agentId: 'worker', runId: run.id,
    mission: ctx.normalizedMission, verifyInputs: true, executable: process.execPath }),
  { code: 'EXECUTION_AUTHORITY_INPUT_SNAPSHOT_CHANGED' });
  const changed = structuredClone(ctx.normalizedMission);
  changed.executionAuthorityRef.signature = '0'.repeat(64);
  await assert.rejects(authority.assertRun(db, { agentId: 'worker', runId: run.id,
    mission: changed }), { code: 'EXECUTION_AUTHORITY_SIGNATURE_CHANGED' });
}

async function rejectUnsigned(db, contract, workspace) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord: contract,
    missionId: 'worker-mission', budget: { tokens: 10, latencyMs: 300000 } });
  const ctx = { db, agentId: 'worker', executionRun: run, executable: process.execPath,
    contractRecord: contract, autonomyPlan: {}, normalizedMission: { agentId: 'worker',
      missionId: 'worker-mission', workspaceRoot: workspace, toolLease: [], timeoutMs: 300000 } };
  const secret = process.env.GENOS_GVX_LEDGER_HMAC_SECRET;
  delete process.env.GENOS_GVX_LEDGER_HMAC_SECRET;
  try {
    await assert.rejects(authority.seal(ctx), { code: 'EXECUTION_AUTHORITY_SIGNATURE_REQUIRED' });
  } finally {
    process.env.GENOS_GVX_LEDGER_HMAC_SECRET = secret;
  }
  assert.equal((await migration.classification(db, run.id)).status, migration.STATUSES.pending);
}

async function rejectMissingScope(db, contract) {
  await db.run("UPDATE agents SET workspace_id = NULL WHERE id = 'worker'");
  const countBefore = await db.get('SELECT COUNT(*) AS count FROM strategy_execution_runs');
  await assert.rejects(execution.createExecutionRun(db, { agentId: 'worker', contractRecord: contract,
    missionId: 'worker-mission', budget: { tokens: 10, latencyMs: 300000 } }),
  { code: 'GVX_MISSION_SCOPE_REQUIRED' });
  const countAfter = await db.get('SELECT COUNT(*) AS count FROM strategy_execution_runs');
  assert.equal(countAfter.count, countBefore.count, 'an unscoped run must roll back with its required binding');
  await db.run("UPDATE agents SET workspace_id = 'worker-workspace' WHERE id = 'worker'");
}

async function rejectMissingBinding(db, contract) {
  const countBefore = await db.get('SELECT COUNT(*) AS count FROM strategy_execution_runs');
  const bindRun = provenance.bindRun;
  provenance.bindRun = async () => null;
  try {
    await assert.rejects(execution.createExecutionRun(db, { agentId: 'worker', contractRecord: contract,
      missionId: 'worker-mission', budget: { tokens: 10, latencyMs: 300000 } }),
    { code: 'GVX_RUN_BINDING_REQUIRED' });
  } finally {
    provenance.bindRun = bindRun;
  }
  const countAfter = await db.get('SELECT COUNT(*) AS count FROM strategy_execution_runs');
  assert.equal(countAfter.count, countBefore.count,
    'a mission run without its binding must roll back inside the same transaction');
}

async function rejectInternalPromotion(db, contract) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord: contract,
    budget: { tokens: 10, latencyMs: 300000 } });
  const state = await migration.classification(db, run.id);
  assert.equal(state.reason, 'internal-only');
  await assert.rejects(execution.approveRun(db, run.id, {}),
    { code: 'EXECUTION_AUTHORITY_BINDING_MISSING' });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-authority-v2-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'input.txt'), 'canonical input');
  const db = openDatabase();
  try {
    const contract = await prepare(db);
    await insertHistoricRun(db, contract);
    await assertHistoricReadOnly(db);
    await rejectMissingScope(db, contract);
    await rejectMissingBinding(db, contract);
    await sealV2(db, contract, workspace);
    await rejectUnsigned(db, contract, workspace);
    await rejectInternalPromotion(db, contract);
    await assert.rejects(authority.assertTool(db, { agentId: 'parent', toolName: 'genos_snapshot' }),
      { code: 'EXECUTION_AUTHORITY_RUN_REQUIRED' });
    console.log('Execution authority v2: canonical envelope, signed binding and read-only legacy migration passed.');
  } finally {
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((failure) => { console.error(failure); process.exitCode = 1; });
module.exports = { main };
