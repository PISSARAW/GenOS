'use strict';

const contracts = require('../strategyContractService.js');
const strategyExecution = require('../strategyExecutionService.js');
const missionBudgetScopes = require('../missionModelBudgetScope.js');

function requestedBudget(context) {
  const budget = context.request.execution_budget || context.request.executionBudget || {};
  if (!Number.isFinite(budget.costUsd) || budget.costUsd <= 0
    || !Number.isSafeInteger(budget.tokens) || budget.tokens <= 0) {
    throw Object.assign(new Error('Trinity dispatch requires explicit positive costUsd and token ceilings.'), {
      code: 'TRINITY_BUDGET_REQUIRED'
    });
  }
  return budget;
}

async function bindTrinityBudgetScope({ db, context, parent }) {
  const budget = requestedBudget(context);
  const missionId = context.missionId || undefined;
  const contractRecord = await contracts.getLatestContract(db, context.orchestratorId);
  if (!contractRecord) throw new Error(`No strategy contract is available for orchestrator '${context.orchestratorId}'.`);
  const executionRun = await strategyExecution.createExecutionRun(db, {
    agentId: context.orchestratorId,
    missionId,
    budget,
    contractRecord
  });
  const normalizedMission = {
    missionId,
    executionBudget: budget
  };
  await missionBudgetScopes.bindParent({
    db,
    agentId: context.orchestratorId,
    dispatchedAgent: { ...parent, execution_mode: 'orchestrator' },
    executionRun,
    normalizedExecutionBudget: budget,
    normalizedMission
  });
  if (!normalizedMission.modelBudgetScope) {
    throw Object.assign(new Error('Trinity parent model budget scope was not persisted.'), {
      code: 'MISSION_MODEL_BUDGET_SCOPE_INVALID'
    });
  }
  return normalizedMission.modelBudgetScope;
}

module.exports = { bindTrinityBudgetScope };
