'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_SKIP_BOOT_DB_BACKUP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'p1-delegation-test-only';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const kinds = require('../src/services/agents/workerKindService');
const { scoped } = require('./helpers/nativeWorkerFixtures');
const bounded = require('../src/services/agents/boundedDelegationAuthority');
const authority = require('../src/services/agentAuthorityService');
const { getDatabase, closeDatabase } = require('../src/db');

async function seed(db, workspace) {
  await db.run("INSERT INTO organizations (id,name) VALUES ('delegation-org','Delegation scope')");
  await db.run("INSERT INTO projects (id,organization_id,name) VALUES ('delegation-project','delegation-org','Delegation')");
  await db.run(`INSERT INTO workspaces (id,name,path,organization_id,project_id)
    VALUES ('delegation-ws','Delegation workspace',?,'delegation-org','delegation-project')`, workspace);
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,cognitive_budget)
    VALUES ('delegation-root','Root','orchestrator','running','orchestrator','delegation-ws',1000000)`);
  const contract = kinds.grantBoundedDelegation(kinds.buildWorkerContract('sub_orchestrator', { parentAgentId: 'delegation-root' }));
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,parent_agent_id,workspace_id,cognitive_budget,metadata_json)
    VALUES ('delegation-sub','Sub','sub_orchestrator','running','worker','delegation-root','delegation-ws',100000,?)`,
  JSON.stringify({ workerKind: 'sub_orchestrator', workerContract: contract }));
  await db.run("INSERT INTO missions (mission_id,objective,orchestrator_agent_id) VALUES ('delegation-mission','Compute a witnessed result','delegation-root')");
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('delegation-mission','delegation-root','orchestrator'),('delegation-mission','delegation-sub','sub_orchestrator')");
  await require('../src/services/strategyContractService').saveContract(db, {
    agentId: 'delegation-root', workspaceId: 'delegation-ws', problem: 'Compute a bounded subset sum with native evidence' });
}

async function addChild(db, input) {
  const contract = kinds.buildWorkerContract(input.kind || 'bounded_worker', {
    parentAgentId: 'delegation-sub', prompt: 'Compute a bounded subset sum',
    methodContract: input.native ? scoped : undefined, workerTokenLimit: input.tokens || 2000 });
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,parent_agent_id,workspace_id,metadata_json)
    VALUES (?,?,'bounded_worker','idle','worker','delegation-sub','delegation-ws',?)`, input.id, input.id,
  JSON.stringify({ workerKind: contract.identity.workerKind, workerContract: contract }));
  return contract;
}

async function bindings(db) {
  await addChild(db, { id: 'delegation-child', native: true });
  await assert.rejects(authority.authorizeMission(db, { agentId: 'delegation-child', orchestratorAgentId: 'delegation-sub' }),
    { code: 'DELEGATION_BINDING_INVALID' });
  const binding = await bounded.bind(db, { parentId: 'delegation-sub', childId: 'delegation-child', allocation: 2000 });
  assert.equal(binding.depth, 1);
  assert.equal(binding.modelTokens, 0);
  assert.equal((await authority.authorizeMission(db, { agentId: 'delegation-child', orchestratorAgentId: 'delegation-sub' })).id, 'delegation-child');
  assert.deepEqual(await bounded.bind(db, { parentId: 'delegation-sub', childId: 'delegation-child', allocation: 2000 }), binding);
  const original = await db.get("SELECT metadata_json FROM agents WHERE id='delegation-sub'");
  const mutated = JSON.parse(original.metadata_json);
  mutated.workerContract.delegationExpiresAt += 1000;
  await db.run("UPDATE agents SET metadata_json=? WHERE id='delegation-sub'", JSON.stringify(mutated));
  await assert.rejects(authority.authorizeMission(db, { agentId: 'delegation-child', orchestratorAgentId: 'delegation-sub' }),
    { code: 'DELEGATION_BINDING_INVALID' });
  await db.run("UPDATE agents SET metadata_json=? WHERE id='delegation-sub'", original.metadata_json);
  await db.run("UPDATE agents SET parent_agent_id='delegation-root' WHERE id='delegation-child'");
  await assert.rejects(bounded.authorize(db, { parent: { id: 'delegation-sub' }, agent: {
    id: 'delegation-child', execution_mode: 'worker', parent_agent_id: 'delegation-root', workspace_id: 'delegation-ws' } }),
  { code: 'WORKER_CONTRACT_DENIED' });
  await db.run("UPDATE agents SET parent_agent_id='delegation-sub' WHERE id='delegation-child'");
}

async function nativeDispatch(db) {
  const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute the scoped subset sum', workerKind: 'bounded_worker', methodContract: scoped, timeoutMs: 20000 });
  assert.equal(result.success, false, JSON.stringify(result));
  if (result.supervision.code !== 'CHILD_EXECUTION_NOT_VERIFIED') {
    console.error(result.supervision);
    console.error(await db.all('SELECT status,runtime_pid,current_task FROM agents WHERE id=?', result.childAgentId));
    console.error(await db.all('SELECT status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=?', result.childAgentId));
    console.error(await db.all('SELECT event_type,payload_json FROM telemetry_events WHERE agent_id=? ORDER BY id DESC LIMIT 3', result.childAgentId));
  }
  assert.equal(result.supervision.code, 'CHILD_EXECUTION_NOT_VERIFIED');
  assert.match(result.supervision.reason, /require_independent_verification/);
  const failed = await db.get('SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type=\'AGENT_FAILED\'', result.childAgentId);
  assert.equal(JSON.parse(failed.payload_json).failure.code, 'WORKER_EXECUTION_HALTED');
  const row = await db.get('SELECT id,status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  assert.equal(row.status, 'blocked');
  const receipt = await require('../src/services/biologicalWorkerStore').receipt(db, row.id);
  assert.equal(receipt.result.verified, false);
  assert.match(receipt.result.reason, /require_independent_verification/);
  const observation = await db.get('SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type=\'EVIDENCE_REPORT\'', result.childAgentId);
  const report = JSON.parse(observation.payload_json).evidenceReport;
  assert.deepEqual(report.workerArtifact.content.result.indices, [0, 2]);
  assert.equal(report.workerArtifact.content.result.sum, 10);
  assert.equal((await require('../src/services/biologicalWorkerStore').observations(db, row.id)).every(item => item.applied), true);
  assert.equal(receipt.costs.find(cost => cost.register === 'worker_llm_tokens')?.quantity, 0);
  const saved = await require('../src/services/missionEnvelopeAuthority').read(db, row.id);
  assert.equal(saved.envelope.missionId, 'delegation-mission');
  assert.equal(saved.envelope.limits.tokens, 0);
  console.log('Delegated native child: real bootstrap and computation, zero model budget, sealed authority and independent-proof refusal preserved.');
  return { runId: row.id, workerId: result.childAgentId };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-delegation-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Bounded native task');
  process.env.GENOS_DB_PATH = path.join(root, 'delegation.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await seed(db, workspace); await bindings(db);
    const executed = await nativeDispatch(db);
    await require('./helpers/nativeOracleProbes').qualify(db, executed);
    await require('./helpers/boundedDelegationProbes').qualify(db, { addChild, filename: process.env.GENOS_DB_PATH });
  }
  finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(failure => { console.error(failure); process.exitCode = 1; });
