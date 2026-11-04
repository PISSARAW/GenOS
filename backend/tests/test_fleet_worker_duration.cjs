'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-fleet-duration-'));
const workspace = path.join(root, 'workspace');
fs.mkdirSync(workspace);
fs.writeFileSync(path.join(workspace, 'public.txt'), 'Public fixture; no model invocation.');
Object.assign(process.env, {GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
  GENOS_DB_PATH: path.join(root, 'runtime.sqlite'), GENOS_WORKSPACE_ROOT: workspace,
  GENOS_CAPSULE_ROOT: path.join(root, 'capsules'), GENOS_DISABLE_WORKSPACE_GC: '1',
  GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex')});
const database = require('../src/db');
const kinds = require('../src/services/agents/workerKindService');
const enforcement = require('../src/services/agents/workerContractEnforcement');

async function scenario(db) {
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,cognitive_budget)
    VALUES ('duration-parent','Duration parent','orchestrator','running','orchestrator','ws-local',1000000)`);
  const duration = 1680000;
  const [worker] = await require('../src/services/agentFleetWorkers').createAutonomousWorkers(db,
    {id: 'duration-parent', agent_type: 'GenOS'}, {mission: {
      prompt: 'Execute a bounded public fixture.', workspaceRoot: workspace, executor: 'local',
      localModel: 'ollama://not-invoked', timeoutMs: duration,
      executionBudget: {tokens: 20000, latencyMs: duration}, executionPolicy: {allowFileEdits: false}},
    plan: {dispatchWorkers: [{workerKind: 'bounded_worker', role: 'bounded_worker', label: 'duration'}],
      strategyContract: {primary: 'tree-search'}, tokenPolicy: {total: 20000, workerShare: 1,
        allocation: 'equal_minimum_then_score_weighted'}}});
  const row = await db.get('SELECT metadata_json FROM agents WHERE id=?', worker.agentId);
  const contract = JSON.parse(row.metadata_json).workerContract;
  assert.equal(contract.mission.timeoutMs, duration);
  assert.equal(contract.resources.maxTimeMs, duration);
  assert.equal(contract.resources.maxTokens, 20000, 'Time allocation does not grant extra tokens.');
  assert.doesNotThrow(() => enforcement.assertRuntimeContract(contract, 'bounded_worker'));
  const stripped = structuredClone(contract);
  delete stripped.mission.timeoutMs;
  assert.throws(() => enforcement.assertRuntimeContract(stripped, 'bounded_worker'), {code: 'INVALID_WORKER_CONTRACT'});
  assert.equal(kinds.buildWorkerContract('bounded_worker').resources.maxTimeMs, 540000,
    'The ordinary role deadline remains unchanged without an explicit allocation.');
}

async function main() {
  try {await scenario(await database.getDatabase());}
  finally {
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await database.closeDatabase();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('genos-fleet-duration-'));
    fs.rmSync(root, {recursive: true, force: true});
  }
  console.log('Actual fleet creation persists the allocated worker duration, preserves token ceilings and rejects stripped authority: PASS');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
