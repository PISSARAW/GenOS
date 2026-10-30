'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const provider = require('../src/services/modelProvider');
const runner = require('../src/services/modelRouteRunner');
const repair = require('../src/services/workerCodeTestRepair');
const schemaFailure = require('../src/services/workerEvidenceBarrierLocalSchemaFailure');
const usage = require('../src/services/workerModelRunUsage');
const strategy = require('../src/services/strategyExecutionService');
const contracts = require('../src/services/strategyContractService');

function stubLifecycle() {
  const state = require('../src/services/agentOrchestrationState');
  state.updateAgent = async () => {};
  state.emit = (...args) => {
    const [agentId, eventType, action, detail, payload] = args;
    return { agentId, eventType, action, detail, payload };
  };
  require('../src/services/agentRecoveryService').queueWorkerRecovery = async () => {};
  require('../src/services/agentRoundService').advanceAutonomousRound = async () => {};
  require('../src/services/agentWorkspaceLifecycleService').scheduleWorkspaceCleanup = async () => {};
  require('../src/services/agentEvidenceService').recordWorkerEvidence = () => {};
}

async function database() {
  const db = openDatabase();
  await db.exec(`${TABLES_MODEL_ATTEMPTS}
    CREATE TABLE provider_configs (provider TEXT, model TEXT, endpoint TEXT,
      capabilities_json TEXT, cost_input REAL, cost_output REAL, latency_ms INTEGER, enabled INTEGER);
    INSERT INTO provider_configs VALUES ('ollama','qwen-test','http://127.0.0.1:11435/api/chat','[]',0,0,0,1);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, execution_mode TEXT, workspace_id TEXT);
    INSERT INTO agents VALUES ('worker','worker',NULL);
    CREATE TABLE strategy_execution_runs (id TEXT PRIMARY KEY, agent_id TEXT, contract_id TEXT,
      contract_version INTEGER, status TEXT, budget_json TEXT, metrics_json TEXT, started_at TEXT,
      completed_at TEXT, guardrail_reason TEXT, created_at TEXT);
    CREATE TABLE strategy_execution_steps (id TEXT, run_id TEXT, sequence INTEGER, status TEXT, completed_at TEXT);`);
  return db;
}

async function execution(db, id) {
  await db.run(`INSERT INTO strategy_execution_runs VALUES (?, 'worker', 'contract', 1,
    'running', ?, '{}', NULL, NULL, NULL, CURRENT_TIMESTAMP)`, id,
  JSON.stringify({ tokens: 10000, costUsd: 1, latencyMs: 60000, events: 100 }));
  await require('../src/db/migrations/migrateExecutionAuthorityV2').registerRun(db, id, false);
  return { db, mission: { agentId: 'worker', localCodeWorker: true,
    timeoutMs: 60000, executionBudget: { tokens: 10000 } }, executionRun: { id } };
}

async function attempts(ctx, succeed) {
  let index = 0;
  provider.generate = async () => {
    index += 1;
    return { text: '{}', provider: 'ollama', model: 'qwen-test', tokenUsageMeasured: true,
      inputTokens: [11, 13, 17][index - 1], outputTokens: [4, 6, 8][index - 1],
      ...(index < 3 ? { schemaViolation: { error: succeed ? `violation-${index}` : 'same-violation' } } : {}) };
  };
  return repair.run({ mission: ctx.mission, runAttempt: async () => {
    const result = await runner.attemptRoute({ db: ctx.db, agentId: 'worker',
      executionRunId: ctx.executionRun.id, prompt: 'x', maxTokens: 100, maxCostUsd: 0,
      remainingMs: () => 5000, onToken() {} }, 'ollama://qwen-test');
    const rejected = schemaFailure.fromModelResult(result);
    if (rejected) throw rejected;
    return result;
  } });
}

async function assertAligned(ctx, payload, expected) {
  const row = await ctx.db.get('SELECT metrics_json FROM strategy_execution_runs WHERE id = ?', ctx.executionRun.id);
  const ledger = await ctx.db.get(`SELECT SUM(input_tokens + output_tokens) AS tokens
    FROM model_attempt_ledger WHERE mission_id = ? AND agent_id = 'worker' AND token_usage_source = 'provider'`,
  ctx.executionRun.id);
  assert.equal(payload.usage.tokens, expected);
  assert.equal(JSON.parse(row.metrics_json).tokens, expected);
  assert.equal(ledger.tokens, expected);
  assert.equal(payload.modelUsageAccounting.complete, true);
}

async function success(db) {
  const ctx = await execution(db, 'success');
  const result = await attempts(ctx, true);
  // A previous per-call usage event must not be added a second time by the summary.
  await strategy.recordExecutionEvent(db, 'worker', { eventType: 'LOCAL_MODEL_USAGE', payload: {
    executionRunId: ctx.executionRun.id, usage: { input_tokens: 11, output_tokens: 4, tokens: 15 } } });
  const event = await require('../src/services/workerEvidenceBarrierLocalCompletion').emitLocalCompleted({
    ...ctx, eventType: 'AGENT_COMPLETED', model: result.model, provider: result.provider,
    evidenceReport: { outcome: 'success', claims: [], uncertainties: [] }, usage: { tokens: 25 } },
  async ({ event: terminal }) => strategy.recordExecutionEvent(db, 'worker', terminal));
  await assertAligned(ctx, event.payload, 59);
  assert.equal(event.payload.model, 'ollama://qwen-test');
  assert.equal(event.payload.modelUsageAccounting.byModel[0].attemptIds.length, 3);
}

async function failure(db) {
  const ctx = await execution(db, 'failure');
  let error;
  try { await attempts(ctx, false); } catch (rejection) { error = rejection; }
  assert.equal(error.code, 'WORKER_TEST_REPAIR_NO_PROGRESS');
  let terminal;
  await require('../src/services/workerEvidenceBarrierLocalFailure').publish({
    ...ctx, error, reportMilestone: (_mission, event) => { terminal = event; } });
  await assertAligned(ctx, terminal.payload, 34);
  assert.equal(terminal.eventType, 'AGENT_FAILED');
}

async function incompleteAndScoped(db) {
  const ctx = await execution(db, 'partial');
  await db.run(`INSERT INTO model_attempt_ledger
    (id,mission_id,agent_id,action_id,model,status,provider_called,input_tokens,output_tokens,token_usage_source,started_at)
    VALUES ('unknown','partial','worker','a','vllm://other','failed',1,NULL,NULL,'unknown','now'),
      ('sibling','partial','sibling','b','ollama://qwen-test','completed',1,100,100,'provider','now'),
      ('other-run','elsewhere','worker','c','ollama://qwen-test','completed',1,100,100,'provider','now')`);
  const accounting = await usage.forRun(ctx);
  assert.equal(accounting.usage, undefined);
  assert.equal(accounting.modelUsageAccounting.complete, false);
  assert.deepEqual(accounting.modelUsageAccounting.unmeasuredAttemptIds, ['unknown']);
  assert.deepEqual(accounting.modelUsageAccounting.byModel, []);
  await db.run(`INSERT INTO model_attempt_ledger
    (id,mission_id,agent_id,action_id,model,status,provider_called,input_tokens,output_tokens,token_usage_source,started_at)
    VALUES ('known-a','partial','worker','d','ollama://qwen-test','completed',1,2,3,'provider','now'),
      ('known-b','partial','worker','e','vllm://other','completed',1,5,7,'provider','now'),
      ('estimate','partial','worker','f','ollama://qwen-test','completed',1,99,99,'estimate','now'),
      ('not-called','partial','worker','g','ollama://qwen-test','skipped_budget',0,0,0,'not_called','now')`);
  const partial = await usage.forRun(ctx);
  assert.equal(partial.usage.tokens, 17);
  assert.equal(partial.modelUsageAccounting.complete, false);
  assert.deepEqual(partial.modelUsageAccounting.unmeasuredAttemptIds, ['unknown', 'estimate']);
  assert.deepEqual(partial.modelUsageAccounting.byModel.map((item) => [item.model, item.usage.tokens]),
    [['ollama://qwen-test', 5], ['vllm://other', 12]]);
  const prior = { tokens: 34, inputTokens: 24, outputTokens: 10, billableTokens: 34, costUsd: 0 };
  const delta = require('../src/services/strategyExecutionEvents').metricDelta({
    ...await usage.forRun({ ...ctx, executionRun: { id: 'failure' } }) }, prior);
  assert.equal(delta.tokens, 0, 'Repeated run totals never count previous attempts twice.');
}

async function main() {
  stubLifecycle();
  const db = await database();
  const originalProvider = provider.generate;
  const originalContract = contracts.getContractById;
  contracts.getContractById = async () => ({ contract: {} });
  try { await success(db); await failure(db); await incompleteAndScoped(db); }
  finally { provider.generate = originalProvider; contracts.getContractById = originalContract; await db.close(); }
  console.log('PASS retry/repair ledger, terminal event and run usage totals without duplicate accounting');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
