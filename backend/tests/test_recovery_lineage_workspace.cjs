'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const evolution = require('../src/services/agentEvolutionService');
const hydration = require('../src/services/workerGenomeHydration');
const { recordRecoveryLineage } = require('../src/services/agentRecovery/recoveryLineage');
const genes = { role: 'resident_daemon', strategy: 'tree-search', tools: ['genos_snapshot'], temp: 0.45, topP: 0.9 };

async function prepare(db) {
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY,workspace_id TEXT,name TEXT,role TEXT,execution_mode TEXT,
      metadata_json TEXT DEFAULT '{}',parent_agent_id TEXT);
    CREATE TABLE lineage_nodes (id TEXT PRIMARY KEY,workspace_id TEXT,agent_id TEXT,label TEXT,node_type TEXT,
      score REAL,state_summary TEXT,metadata TEXT);
    CREATE TABLE lineage_edges (id TEXT PRIMARY KEY,workspace_id TEXT,source_node_id TEXT,target_node_id TEXT,edge_type TEXT);
    CREATE TABLE strategy_execution_runs (id TEXT,agent_id TEXT,status TEXT);
    INSERT INTO agents VALUES ('root','garage','root','orchestrator','orchestrator','{}',NULL);
    INSERT INTO agents VALUES ('source','old-capsule','source','resident_daemon','worker','{}','root');
    INSERT INTO agents VALUES ('fork','new-capsule','fork','independent_reviewer','worker','{}','root');`);
}

async function scopedFork(db) {
  const source = { id: 'source', workspace_id: 'old-capsule' };
  const target = { targetId: 'fork', sourceAgentId: 'source', orchestratorId: 'root',
    workspaceId: 'new-capsule', role: 'independent_reviewer', mission: { genome: genes } };
  await recordRecoveryLineage(db, source, target);
  const row = await db.get("SELECT workspace_id,metadata FROM lineage_nodes WHERE id='fork'");
  assert.equal(row.workspace_id, 'new-capsule');
  const metadata = JSON.parse(row.metadata);
  assert.deepEqual(metadata.parents, { recoverySource: 'source', orchestrator: 'root' });
  assert.deepEqual(metadata.genes, { ...genes, prompt: '' });
  assert.equal((await db.all('SELECT * FROM lineage_edges')).length, 0);
  assert.deepEqual(await hydration.persistedGenes(db, { id: 'fork', workspace_id: 'new-capsule' }), metadata.genes);
  await assert.rejects(hydration.persistedGenes(db, { id: 'fork', workspace_id: 'garage' }),
    { code: 'WORKER_GENOME_SCOPE_MISMATCH' });
}

async function absentAndInvalidGenes(db) {
  for (const id of ['unknown', 'invalid']) {
    await db.run("INSERT INTO agents VALUES (?,'new-capsule',?,'worker','worker','{}','root')", id, id);
  }
  assert.equal((await evolution.recordWorkerLineage(db,
    { agentId: 'unknown', workspaceId: 'new-capsule' })).success, true);
  assert.equal(await hydration.persistedGenes(db, { id: 'unknown', workspace_id: 'new-capsule' }), null);
  assert.equal((await evolution.recordWorkerLineage(db,
    { agentId: 'invalid', workspaceId: 'new-capsule' }, { genes: {} })).success, true);
  await assert.rejects(hydration.persistedGenes(db, { id: 'invalid', workspace_id: 'new-capsule' }),
    { code: 'INVALID_WORKER_GENOME' });
}

async function inheritedContract(db) {
  const contract = require('../src/services/agents/workerKindService').buildWorkerContract('resident_daemon', {
    orchestratorAgentId: 'root', prompt: 'Observe the allocation.', workerAssignment: { marker: 'sealed-source-assignment' } });
  await db.run("UPDATE agents SET metadata_json=? WHERE id='source'", JSON.stringify({ workerContract: contract,
    dnaIncarnation: { signature: 'source-owned' }, clinicalAdmission: { signature: 'source-owned' } }));
  const bind = require('../src/services/agentRecovery/recoveryMissionBinding').inheritWorkerContract;
  await bind(db, { id: 'source' }, { targetId: 'fork', orchestratorId: 'root' });
  const metadata = JSON.parse((await db.get("SELECT metadata_json FROM agents WHERE id='fork'")).metadata_json);
  assert.deepEqual(metadata, { workerKind: 'resident_daemon', workerContract: JSON.parse(JSON.stringify(contract)) });
  await assert.rejects(bind(db, { id: 'source' }, { targetId: 'fork', orchestratorId: 'foreign' }),
    { code: 'RECOVERY_CONTRACT_PARENT_MISMATCH' });
  await assert.rejects(bind(db, { id: 'source' }, { targetId: 'root', orchestratorId: 'root' }),
    { code: 'RECOVERY_CONTRACT_TARGET_MISMATCH' });
}

function continuityBounds() {
  const { equivalentBindings } = require('../src/services/agentRecovery/recoveryContinuity');
  const original = { missionId: 'mission', parentWorkerId: 'root', tenant: { organizationId: 'org', projectId: 'project' },
    genome: { workerContract: { identity: { workerKind: 'resident_daemon' }, assignment: { verification: 'sealed' } } } };
  assert.equal(equivalentBindings(original, structuredClone(original)), true);
  assert.equal(equivalentBindings(original, { ...original, missionId: 'foreign' }), false);
  assert.equal(equivalentBindings(original, { ...original, parentWorkerId: 'foreign' }), false);
  assert.equal(equivalentBindings(original, { ...original, tenant: { organizationId: 'other' } }), false);
  assert.equal(equivalentBindings(original, { ...original, genome: { workerContract: {} } }), false);
}

async function failedSourcesOnly(db) {
  const { assertFailedSource } = require('../src/services/agentRecovery/recoveryContinuity');
  await db.run("INSERT INTO strategy_execution_runs VALUES ('source-run','source','failed')");
  for (const status of ['failed', 'blocked', 'cancelled']) {
    await db.run("UPDATE strategy_execution_runs SET status=?", status);
    await assert.doesNotReject(assertFailedSource(db, 'source'));
  }
  for (const status of ['completed', 'running', 'planned']) {
    await db.run("UPDATE strategy_execution_runs SET status=?", status);
    await assert.rejects(assertFailedSource(db, 'source'), { code: 'RECOVERY_CONTINUITY_SOURCE_NOT_FAILED' });
  }
}

async function main() {
  const db = openDatabase();
  try { await prepare(db); await scopedFork(db); await absentAndInvalidGenes(db); await inheritedContract(db); continuityBounds(); await failedSourcesOnly(db); }
  finally { await db.close(); }
  console.log('Recovery lineage: final capsule, inherited genome, provenance and cross-workspace refusal PASS.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
