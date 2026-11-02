'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'direct-worker-real-budget-tests';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolFixture');
const scopes = require('../src/services/missionModelBudgetScope');
const budget = require('../bin/directWorkerBudgetScope.cjs');

async function main() {
  const ctx = await fixture.create();
  try {
    await ctx.db.exec(require('../src/db/schema-model-attempts').TABLES_MODEL_ATTEMPTS);
    await ctx.db.exec('ALTER TABLE workspaces ADD COLUMN path TEXT');
    await ctx.db.run('UPDATE workspaces SET path=?', ctx.workspace);
    const parent = await ctx.db.get(`SELECT a.*,w.path workspace_root FROM agents a
      JOIN workspaces w ON w.id=a.workspace_id WHERE a.id='parent'`);
    const mission = { agentId: ctx.agentId, localRuntime: true, workerKind: 'bounded_worker',
      executionBudget: { costUsd: 1, tokens: 5000, latencyMs: 300000 } };
    const context = { orchestratorId: parent.id, missionId: 'worker-mission', task: 'Dispatch bounded model work.', request: {} };
    const input = { db: ctx.db, context, parent, mission, contractRecord: ctx.contractRecord };
    await budget.bindDirectWorkerBudget(input);
    const scope = mission.modelBudgetScope;
    assert.equal(scope.id, `execution-run:${context.directWorkerParentBudgetRunId}`);
    const route = await scopes.routeBudget({ ...mission, orchestratorAgentId: parent.id }, ctx.db);
    assert.equal(route.budgetReservationId, scope.id);
    const binding = await require('../src/services/missionProtocols/context').load(ctx.db, context.directWorkerParentBudgetRunId);
    assert.deepEqual(binding.mission.modelBudgetScope, scope);
    const count = (await ctx.db.get('SELECT COUNT(*) count FROM strategy_execution_runs')).count;
    await assert.rejects(budget.bindDirectWorkerBudget({ ...input,
      context: { ...context, request: { execution_budget: { costUsd: 0.5, tokens: 1000 } } } }),
      { code: 'DIRECT_WORKER_BUDGET_REQUIRED' });
    assert.equal((await ctx.db.get('SELECT COUNT(*) count FROM strategy_execution_runs')).count, count);
    context.delegatedWorkerId = ctx.agentId;
    await budget.closeParentFromWorkers(ctx.db, context, [{ id: ctx.agentId, latest_run_status: 'running' }]);
    assert.equal((await ctx.db.get('SELECT status FROM strategy_execution_runs WHERE id=?', context.directWorkerParentBudgetRunId)).status, 'running');
    await budget.closeParentFromWorkers(ctx.db, context, [{ id: ctx.agentId, latest_run_status: 'completed' }]);
    assert.equal((await ctx.db.get('SELECT status FROM strategy_execution_runs WHERE id=?', context.directWorkerParentBudgetRunId)).status, 'cancelled');
    await assert.rejects(budget.bindDirectWorkerBudget({ ...input,
      context: { ...context, request: { execution_budget: { tokens: 1000, costUsd: 1 } } },
      mission: { ...mission, modelBudgetScope: null } }), { code: 'DIRECT_WORKER_BUDGET_REQUIRED' });
    await ctx.db.run("INSERT INTO missions(mission_id,objective,status,orchestrator_agent_id) VALUES('another','other','active','parent')");
    await assert.rejects(budget.bindDirectWorkerBudget({ ...input, context: { ...context, missionId: 'another' } }),
      { code: 'DIRECT_WORKER_BUDGET_REQUIRED' });
    await ctx.db.run('UPDATE workspaces SET path=?', ctx.root);
    await assert.rejects(require('../bin/directWorkerControlRun.cjs').prepare({ ...input, budget: ctx.executionRun.budget }),
      { code: 'DIRECT_WORKER_CONTROL_SCOPE_REQUIRED' });
    console.log('Direct worker native budget: sealed shared scope, honest control closure, small budget/cross-mission/stale workspace refusals passed.');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
