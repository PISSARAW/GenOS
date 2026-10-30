'use strict';
const assert = require('node:assert/strict');
const execution = require('../src/services/strategyExecutionService');
const scopes = require('../src/services/missionModelBudgetScope');
const { bindDirectWorkerBudget, closeParentFromWorkers, closeParentBudgetRun } = require('../bin/directWorkerBudgetScope.cjs');

(async () => {
  const original = execution.createExecutionRun;
  let persisted;
  const updates = [];
  execution.createExecutionRun = async (_db, input) => {
    assert.equal(input.agentId, 'parent');
    return { id: 'parent-run' };
  };
  const db = {
    exec: async () => {},
    get: async sql => sql.includes('FROM workspaces') ? { organization_id: 'org', project_id: 'project' } : persisted,
    run: async (sql, ...values) => {
      if (!sql.includes('INSERT OR IGNORE INTO mission_model_budget_scopes')) { updates.push({ sql, values }); return; }
      persisted = { scope_id: values[0], parent_run_id: values[1], parent_agent_id: values[2],
        organization_id: values[3], project_id: values[4], cost_ceiling_usd: values[5], token_ceiling: values[6] };
    }
  };
  try {
    const mission = { localRuntime: true, workerKind: 'bounded_worker', executionBudget: { costUsd: 1, tokens: 5000 } };
    const input = { db, context: { orchestratorId: 'parent', missionId: 'mission' }, parent: { workspace_id: 'workspace' }, mission, contractRecord: {} };
    await bindDirectWorkerBudget(input);
    assert.equal(mission.modelBudgetScope.id, 'execution-run:parent-run');
    const route = await scopes.routeBudget({ ...mission, orchestratorAgentId: 'parent' }, db);
    assert.equal(route.budgetReservationId, mission.modelBudgetScope.id);
    assert.ok(updates.some(update => update.sql.includes("status = 'running'")));
    input.context.delegatedWorkerId = 'worker';
    await closeParentFromWorkers(db, input.context, [{ id: 'worker', latest_run_status: 'running' }]);
    assert.equal(updates.filter(update => update.sql.includes('completed_at')).length, 0);
    await closeParentFromWorkers(db, input.context, [{ id: 'worker', latest_run_status: 'completed' }]);
    assert.equal(updates.at(-1).values[0], 'cancelled');
    await closeParentBudgetRun(db, input.context, 'failed');
    assert.equal(updates.at(-1).values[0], 'failed');
    const smaller = { localRuntime: true, workerKind: 'bounded_worker', executionBudget: { costUsd: 1, tokens: 6000 } };
    await bindDirectWorkerBudget({ ...input, context: { ...input.context, request: { execution_budget: { costUsd: 1, tokens: 16000 } } }, mission: smaller });
    assert.equal(smaller.modelBudgetScope.tokens, 16000);
    await assert.rejects(bindDirectWorkerBudget({ ...input, context: { ...input.context, request: { execution_budget: { costUsd: 1, tokens: 5000 } } }, mission: { ...smaller, modelBudgetScope: null } }), { code: 'DIRECT_WORKER_BUDGET_REQUIRED' });
    await assert.rejects(bindDirectWorkerBudget({ ...input, mission: { ...mission, modelBudgetScope: null, executionBudget: { tokens: 5000 } } }), { code: 'DIRECT_WORKER_BUDGET_REQUIRED' });
    const supplied = { ...mission, modelBudgetScope: { id: 'existing' } };
    await bindDirectWorkerBudget({ ...input, mission: supplied });
    assert.equal(supplied.modelBudgetScope.id, 'existing');
    const native = { localRuntime: true, workerKind: 'math_worker' };
    await bindDirectWorkerBudget({ ...input, mission: native });
    assert.equal(native.modelBudgetScope, undefined);
  } finally { execution.createExecutionRun = original; }
  console.log('Direct worker budget scope checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
