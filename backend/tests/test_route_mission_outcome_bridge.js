'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_SKIP_BOOT_DB_BACKUP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'route-mission-bridge-test-only';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'route-mission-bridge-receipts-only';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { seed } = require('./test_bounded_worker_delegation');
const { scoped } = require('./helpers/nativeWorkerFixtures');
const { getDatabase, closeDatabase } = require('../src/db');
const bridge = require('../src/services/routeMissionOutcomeBridge');
const bandit = require('../src/services/routingBanditService');

async function nativeRun(db) {
  const result = await require('../src/services/agents/subOrchestratorDispatchService')
    .dispatchSubOrchestratorWorker(db, 'delegation-sub', {
      mission: 'Compute a scoped subset sum', workerKind: 'bounded_worker',
      methodContract: scoped, timeoutMs: 60000 });
  assert.equal(result.success, true, JSON.stringify(result));
  const run = await db.get(`SELECT * FROM strategy_execution_runs
    WHERE agent_id=? ORDER BY rowid DESC LIMIT 1`, result.childAgentId);
  assert.equal(run.status, 'completed', run.guardrail_reason);
  assert.equal(JSON.parse(run.budget_json).tokens, 0,
    'The native worker has no model-token budget in this run');
  return run;
}

async function recordAction(db, run) {
  const actionId = `route-action-${run.id}`;
  const attemptId = `route-attempt-${run.id}`;
  const receipt = await require('../src/services/biologicalWorkerStore').receipt(db, run.id);
  const tokens = receipt.costs.find((item) => item.register === 'worker_llm_tokens').quantity;
  const cost = receipt.costs.find((item) => item.register === 'worker_provider_billing').quantity;
  assert.equal(tokens, 0);
  assert.equal(cost, 0);
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_action_decisions (
    id TEXT PRIMARY KEY, run_id TEXT, mission_id TEXT, action_id TEXT, mode TEXT,
    status TEXT, journal_json TEXT, result_digest TEXT, closed_at TEXT)`);
  await db.run(`INSERT INTO mission_action_decisions
    (id,run_id,mission_id,action_id,mode,status,journal_json,result_digest,closed_at)
    VALUES(?,?,?,?,?,?,?,?,?)`, `journal-${run.id}`, run.id, 'delegation-mission', actionId,
  'active', 'executed_unverified', JSON.stringify({ selectedId: actionId,
    alternatives: [{ id: actionId, kind: 'small_model', eligible: true }] }),
  `sha256:${'a'.repeat(64)}`, run.completed_at);
  await db.run(`INSERT INTO model_attempt_ledger
    (id,mission_id,action_id,organization_id,project_id,agent_id,model,status,
     provider_called,input_tokens,output_tokens,token_usage_source,cost_usd,started_at,finished_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, attemptId, run.id, actionId,
  'delegation-org', 'delegation-project', run.agent_id, 'test://bounded-model',
  'completed', 1, tokens, 0, 'provider', cost, run.started_at, run.completed_at);
  return attemptId;
}

async function testVerifiedLearning(db, run) {
  const attemptId = await recordAction(db, run);
  const derived = await bridge.derive(db, run.id);
  assert.equal(derived, null);
  assert.equal(await bridge.ingest(db, run.id), null);
  assert.equal((await bandit.qualifiedObservations(db)).length, 0);
  await db.run("UPDATE model_attempt_ledger SET token_usage_source='estimate' WHERE id=?", attemptId);
  assert.equal(await bridge.derive(db, run.id), null);
  assert.equal((await bandit.qualifiedObservations(db)).length, 0);
  await db.run("UPDATE model_attempt_ledger SET token_usage_source='provider' WHERE id=?", attemptId);
  await db.run('UPDATE model_attempt_ledger SET cost_usd=1 WHERE id=?', attemptId);
  assert.equal(await bridge.derive(db, run.id), null);
  await db.run('UPDATE model_attempt_ledger SET cost_usd=0 WHERE id=?', attemptId);
  await db.run("UPDATE mission_action_decisions SET status='shadow' WHERE action_id=?", `route-action-${run.id}`);
  assert.equal(await bridge.ingest(db, run.id), null);
}

async function main() {
  const root = await fs.mkdtemp(path.join(__dirname, '.tmp-route-mission-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Bounded route mission');
  process.env.GENOS_DB_PATH = path.join(root, 'route-mission.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try { await seed(db, workspace); await testVerifiedLearning(db, await nativeRun(db)); }
  finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log('Native mission without observed model usage refuses routing learning: passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
