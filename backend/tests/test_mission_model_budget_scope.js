'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const scopeService = require('../src/services/missionModelBudgetScope');
const workers = require('../src/services/agentFleetWorkers');
const localWorker = require('../src/services/workerEvidenceBarrierLocal');
const router = require('../src/services/modelRouter');
const runner = require('../src/services/modelRouteRunner');
const provider = require('../src/services/modelProvider');

async function database() {
  const db = openDatabase();
  await db.exec(`${TABLES_MODEL_ATTEMPTS}
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE provider_configs (provider TEXT, model TEXT, endpoint TEXT,
      capabilities_json TEXT, cost_input REAL, cost_output REAL,
      latency_ms INTEGER, enabled INTEGER);
    CREATE TABLE usage_ledger (id TEXT PRIMARY KEY, organization_id TEXT,
      project_id TEXT, release_id TEXT, category TEXT, quantity REAL,
      cost_usd REAL, metadata_json TEXT);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', 'workspace', 'org', 'project');
  await db.run('INSERT INTO provider_configs VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'openai', 'model', 'https://api.example.test/v1', '[]', 1, 1, 0, 1);
  return db;
}

function routeInput(db, mission) {
  return { db, mission, workerModel: 'openai://model', latencyMs: 1000,
    maxTokens: 1, maxCost: mission.executionBudget.costUsd,
    policy: { primary: 'openai://model' }, stageTimings: {}, promptText: 'x' };
}

function childMission(parent, index) {
  const meta = workers.buildWorkerMeta({ parent: { id: 'parent' },
    plan: { dispatchWorkers: [{}, {}] }, mission: parent, index,
    assignedTokens: 2, evolution: {}, dnaSelection: null });
  return { agentId: `child-${index}`, orchestratorAgentId: 'parent',
    modelBudgetScope: meta.modelBudgetScope, executionBudget: meta.executionBudget };
}

async function testConcurrentChildren(budget) {
  const db = await database();
  const originalRoute = router.generate;
  const originalProvider = provider.generate;
  let calls = 0;
  router.generate = (options) => runner.attemptRoute({ ...options,
    onToken() {}, remainingMs: () => 1000 }, options.model);
  provider.generate = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { text: 'ok', inputTokens: 1, outputTokens: 1,
      tokenUsageMeasured: true };
  };
  try {
    const parent = { agentId: 'parent', executionBudget: {
      costUsd: budget.costUsd, tokens: budget.tokens } };
    await scopeService.bindParent({ db, agentId: 'parent',
      dispatchedAgent: { execution_mode: 'orchestrator', workspace_id: 'workspace' },
      executionRun: { id: 'parent-run' },
      normalizedExecutionBudget: { costUsd: budget.costUsd, tokens: budget.tokens },
      autonomyPlan: { tokenPolicy: { total: budget.tokens } }, normalizedMission: parent });
    const first = childMission(parent, 0);
    const second = childMission(parent, 1);
    assert.equal(first.modelBudgetScope.id, second.modelBudgetScope.id);
    assert.equal(first.modelBudgetScope.id, parent.modelBudgetScope.id);
    assert.equal(first.executionBudget.costUsd, budget.costUsd / 2);
    await localWorker.generateWorkerResult(routeInput(db, parent));
    const outcomes = await Promise.allSettled([
      localWorker.generateWorkerResult(routeInput(db, first)),
      localWorker.generateWorkerResult(routeInput(db, second))
    ]);
    assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find((item) => item.status === 'rejected').reason.code,
      'MODEL_COST_BUDGET_EXCEEDED');
    assert.match(outcomes.find((item) => item.status === 'rejected').reason.message,
      budget.rejection);
    const forged = { ...first, modelBudgetScope: {
      ...first.modelBudgetScope, costUsd: budget.costUsd * 10 } };
    await assert.rejects(localWorker.generateWorkerResult(routeInput(db, forged)),
      (error) => error.code === 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
    assert.equal(calls, 2);
    const rows = await db.all('SELECT scope_id, status FROM model_budget_reservations');
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.status === 'settled').length, 2);
    assert.equal(new Set(rows.map((row) => row.scope_id)).size, 1);
  } finally {
    router.generate = originalRoute;
    provider.generate = originalProvider;
    await db.close();
  }
}

async function testMissingAuthorityFailsClosed() {
  const db = await database();
  try {
    const parent = { agentId: 'legacy', executionBudget: { costUsd: 1 } };
    await scopeService.bindParent({ db, normalizedMission: parent,
      dispatchedAgent: { execution_mode: 'orchestrator', workspace_id: 'workspace' },
      executionRun: { id: 'legacy-run' },
      normalizedExecutionBudget: { costUsd: 1, tokens: 100000 } });
    assert.equal(parent.modelBudgetScope, undefined);
    await assert.rejects(scopeService.routeBudget({ executionBudget: { costUsd: 1 } }, db),
      (error) => error.code === 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
    await assert.rejects(scopeService.routeBudget({ modelBudgetScope: {
      id: 'run', costUsd: 1, tokens: 2 }, executionBudget: { costUsd: 1 } }, null),
    (error) => error.code === 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
    await assert.rejects(scopeService.routeBudget({ agentId: 'legacy', modelBudgetScope: {
      id: 'forged', costUsd: 1, tokens: 2 }, executionBudget: { costUsd: 1 } }, db),
    (error) => error.code === 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
  } finally { await db.close(); }
}

(async () => {
  await testConcurrentChildren({ costUsd: 0.000004, tokens: 6,
    rejection: /remaining shared budget/ });
  await testConcurrentChildren({ costUsd: 0.00001, tokens: 4,
    rejection: /token reservation/ });
  await testMissingAuthorityFailsClosed();
  console.log('Mission model budget scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
