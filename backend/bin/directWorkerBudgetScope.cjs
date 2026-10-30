'use strict';

const scopes = require('../src/services/missionModelBudgetScope');
const execution = require('../src/services/strategyExecutionService');
const limits = require('../src/services/agents/workerRuntimeLimitsService');

function parentBudget(context, mission) {
  const budget = context.request?.execution_budget || context.request?.executionBudget || mission.executionBudget || {};
  if (!Number.isFinite(budget.costUsd) || budget.costUsd <= 0
    || !Number.isSafeInteger(budget.tokens) || budget.tokens <= 0) {
    throw Object.assign(new Error('Direct model worker requires explicit positive costUsd and token ceilings.'),
      { code: 'DIRECT_WORKER_BUDGET_REQUIRED' });
  }
  if (mission.executionBudget?.tokens > budget.tokens || mission.executionBudget?.costUsd > budget.costUsd) {
    throw Object.assign(new Error('Worker budget exceeds its parent budget.'), { code: 'DIRECT_WORKER_BUDGET_REQUIRED' });
  }
  return budget;
}

function childBudget(request) {
  const budget = { ...(request.execution_budget || request.executionBudget || {}) };
  if (Number.isSafeInteger(request.workerTokenLimit)) budget.tokens = request.workerTokenLimit;
  return budget;
}

async function closeParentBudgetRun(db, context, outcome) {
  const runId = context.directWorkerParentBudgetRunId;
  if (!runId || !outcome) return;
  const status = { completed: 'cancelled', cancelled: 'cancelled', failed: 'failed', blocked: 'blocked' }[outcome];
  if (!status) return;
  const reason = outcome === 'completed' ? 'Budget authority closed after worker completion; no parent decision asserted.'
    : `Budget authority closed after worker ${outcome}.`;
  await db.run(`UPDATE strategy_execution_runs SET status = ?, guardrail_reason = ?, completed_at = ?
    WHERE id = ? AND status IN ('planned', 'running')`, status, reason, new Date().toISOString(), runId);
}

async function closeParentFromWorkers(db, context, agents) {
  const worker = (agents || []).find(agent => agent.id === context.delegatedWorkerId);
  await closeParentBudgetRun(db, context, worker?.latest_run_status);
}

async function bindDirectWorkerBudget({ db, context, parent, mission, contractRecord }) {
  if (mission.modelBudgetScope || !mission.localRuntime || limits.isDeterministicWorkerMission(mission)) return;
  const budget = parentBudget(context, mission);
  const run = await execution.createExecutionRun(db, {
    agentId: context.orchestratorId, missionId: context.missionId || undefined, budget, contractRecord
  });
  context.directWorkerParentBudgetRunId = run.id;
  const parentMission = { executionBudget: budget };
  try {
    await scopes.bindParent({ db, agentId: context.orchestratorId,
      dispatchedAgent: { ...parent, execution_mode: 'orchestrator' }, executionRun: run,
      normalizedExecutionBudget: budget, normalizedMission: parentMission });
    if (!parentMission.modelBudgetScope) throw new Error('Direct worker parent budget scope was not persisted.');
    await db.run("UPDATE strategy_execution_runs SET status = 'running', started_at = ? WHERE id = ? AND status = 'planned'", new Date().toISOString(), run.id);
  } catch (error) { await closeParentBudgetRun(db, context, 'failed'); throw error; }
  mission.modelBudgetScope = parentMission.modelBudgetScope;
}

module.exports = { bindDirectWorkerBudget, childBudget, closeParentBudgetRun, closeParentFromWorkers };
