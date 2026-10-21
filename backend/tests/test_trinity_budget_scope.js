'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const contracts = require('../src/services/strategyContractService.js');
const strategyExecution = require('../src/services/strategyExecutionService.js');
const budgetScopes = require('../src/services/missionModelBudgetScope.js');
const reservations = require('../src/services/modelBudgetReservationService.js');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const { bindTrinityBudgetScope, assertWorkerBudgetSupport } = require('../src/services/topology/trinityBudgetScope.cjs');

function testCodexBudgetCompatibilityPreflight() {
  assert.throws(() => assertWorkerBudgetSupport({ request: { executor: 'codex' } }, [
    { workerKind: 'bounded_worker' }
  ]), { code: 'TRINITY_EXECUTOR_BUDGET_UNSUPPORTED' });
  assert.doesNotThrow(() => assertWorkerBudgetSupport({ request: { executor: 'caller_mcp' } }, [
    { workerKind: 'bounded_worker' }
  ]));
  assert.doesNotThrow(() => assertWorkerBudgetSupport({ request: { executor: 'codex' } }, [
    { workerKind: 'procedural_executor', methodContract: {
      version: 1, methodId: 'subset_sum', parameters: { values: [1], target: 1 }
    } }
  ]));
}

async function testParentScopeIsPersistedAndRoutable() {
  const previousContractLookup = contracts.getLatestContract;
  const previousRunCreation = strategyExecution.createExecutionRun;
  let persisted;
  contracts.getLatestContract = async () => ({ id: 'contract-1', version: 1, contract: {} });
  strategyExecution.createExecutionRun = async (_db, input) => {
    assert.equal(input.agentId, 'parent');
    assert.equal(input.missionId, 'generic-mission');
    assert.equal(input.budget.costUsd, 0.5);
    return { id: 'parent-run' };
  };
  const db = {
    exec: async () => {},
    get: async (sql) => sql.includes('FROM workspaces')
      ? { organization_id: 'org', project_id: 'project' } : persisted,
    run: async (_sql, ...values) => {
      persisted = {
        scope_id: values[0], parent_run_id: values[1], parent_agent_id: values[2],
        organization_id: values[3], project_id: values[4],
        cost_ceiling_usd: values[5], token_ceiling: values[6]
      };
      return { changes: 1 };
    }
  };
  try {
    const scope = await bindTrinityBudgetScope({ db,
      context: { orchestratorId: 'parent', missionId: 'generic-mission',
        request: { trinityMissionId: 'trinity-mission-1',
          execution_budget: { costUsd: 0.5, tokens: 1000 } } },
      parent: { workspace_id: 'workspace' } });
    assert.equal(persisted.parent_run_id, 'parent-run');
    assert.deepEqual(scope, { id: 'execution-run:parent-run', costUsd: 0.5,
      tokens: 1000, organizationId: 'org', projectId: 'project' });
    const routed = await budgetScopes.routeBudget({ agentId: 'worker',
      orchestratorAgentId: 'parent', modelBudgetScope: scope,
      executionBudget: { costUsd: 0.25 } }, db);
    assert.equal(routed.budgetReservationId, scope.id);
    assert.equal(routed.reservationCostCeilingUsd, 0.5);
    assert.equal(routed.budgetMaxTokens, 1000);
  } finally {
    contracts.getLatestContract = previousContractLookup;
    strategyExecution.createExecutionRun = previousRunCreation;
  }
}

async function testMissingCeilingsFailClosed() {
  await assert.rejects(bindTrinityBudgetScope({ db: {}, context: {
    orchestratorId: 'parent', request: { execution_budget: { tokens: 1000 } }
  }, parent: {} }), (error) => error.code === 'TRINITY_BUDGET_REQUIRED');
}

async function testRealExecutionRunBootstrap() {
  const db = openDatabase();
  const contract = { selected_strategy: { primary: 'fixture' },
    strategy_portfolio: [], execution_pipeline: [] };
  try {
    await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, execution_mode TEXT,
      workspace_id TEXT);
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
      CREATE TABLE strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT,
      workspace_id TEXT, version INTEGER, status TEXT, primary_strategy TEXT,
      contract_hash TEXT, contract_json TEXT, decision_reason TEXT, created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE strategy_execution_runs (id TEXT PRIMARY KEY, agent_id TEXT,
      contract_id TEXT, contract_version INTEGER, status TEXT, budget_json TEXT,
      metrics_json TEXT, guardrail_reason TEXT, started_at TEXT, completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE strategy_execution_steps (id TEXT PRIMARY KEY, run_id TEXT,
      sequence INTEGER, stage_key TEXT, status TEXT, strategy_ids_json TEXT,
      planned_budget_json TEXT, actual_metrics_json TEXT, evidence_json TEXT,
      started_at TEXT, completed_at TEXT);
      ${TABLES_MODEL_ATTEMPTS}`);
    await db.run('INSERT INTO agents (id, execution_mode) VALUES (?, ?)',
      'real-parent', 'orchestrator');
    await db.run(`INSERT INTO strategy_contracts
      (id, agent_id, version, status, primary_strategy, contract_hash,
       contract_json, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    'contract-real', 'real-parent', 1, 'active', 'fixture',
    contracts.hashContract(contract), JSON.stringify(contract), 'test');
    const scope = await bindTrinityBudgetScope({ db,
      context: { orchestratorId: 'real-parent', request: {
        executionBudget: { costUsd: 0.5, tokens: 1000 }
      } }, parent: {} });
    const run = await db.get('SELECT id, status FROM strategy_execution_runs');
    const persisted = await db.get('SELECT parent_run_id FROM mission_model_budget_scopes');
    assert.equal(run.status, 'planned');
    assert.equal(scope.id, `execution-run:${run.id}`);
    assert.equal(persisted.parent_run_id, run.id);
    const routed = await budgetScopes.routeBudget({ agentId: 'real-worker',
      orchestratorAgentId: 'real-parent', modelBudgetScope: scope,
      executionBudget: { costUsd: 0.25, tokens: 500 } }, db);
    assert.equal(routed.budgetReservationId, scope.id);
    const reservation = await reservations.reserve({ db,
      attempt: { id: 'real-attempt', actionId: 'real-action' }, ctx: routed,
      costUsd: 0.1, tokens: 10 });
    await reservations.settle(db, reservation, { providerCalled: true,
      costUsd: 0.1, tokens: 10 });
    assert.equal((await db.get('SELECT status FROM model_budget_reservations WHERE id = ?',
      'real-attempt')).status, 'settled');
    await assert.rejects(budgetScopes.routeBudget({ agentId: 'worker',
      orchestratorAgentId: 'real-parent', modelBudgetScope: { ...scope, tokens: 2000 },
      executionBudget: { costUsd: 0.25 } }, db),
    (error) => error.code === 'MISSION_MODEL_BUDGET_SCOPE_INVALID');
  } finally { await db.close(); }
}

(async () => {
  testCodexBudgetCompatibilityPreflight();
  await testParentScopeIsPersistedAndRoutable();
  await testMissingCeilingsFailClosed();
  await testRealExecutionRunBootstrap();
  console.log('Trinity parent model budget scope: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
