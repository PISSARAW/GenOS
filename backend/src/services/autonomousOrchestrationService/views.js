const { listStrategies } = require('../../strategies/strategyRegistry');

function buildRegistry(portfolio) {
  return { total: listStrategies().length, selected: portfolio.map((strategy) => strategy.id) };
}

function buildTokenPolicyView(contract, plan) {
  return {
    total: plan.totalTokens,
    workerShare: plan.effectiveWorkerShare,
    orchestratorReserve: plan.orchestratorReserve,
    orchestratorReserveTokens: plan.orchestratorReserveTokens,
    minimumOrchestratorReserveTokens: plan.minimumOrchestratorReserveTokens,
    explicitWorkerShare: plan.explicitWorkerShare,
    allocation: plan.allocation,
    minimumWorkerTokens: plan.minimumWorkerTokens,
    minimumWorkerTokensExplicit: plan.minimumWorkerTokensExplicit,
    workerBudgets: plan.workerBudgets,
    admission: plan.admission,
    stopConditions: contract.stop_conditions || [],
    rounds: plan.rounds
  };
}

module.exports = { buildRegistry, buildTokenPolicyView };
