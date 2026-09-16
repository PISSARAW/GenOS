const { listStrategies } = require('../../strategies/strategyRegistry');

function buildRegistry(portfolio) {
  return { total: listStrategies().length, selected: portfolio.map((strategy) => strategy.id) };
}

function buildTokenPolicyView(contract, plan) {
  return {
    total: plan.totalTokens,
    workerShare: plan.dispatchWorkers.length ? plan.effectiveWorkerShare : 0,
    orchestratorReserve: plan.dispatchWorkers.length ? plan.orchestratorReserve : 1,
    allocation: plan.allocation,
    minimumWorkerTokens: plan.minimumWorkerTokens,
    stopConditions: contract.stop_conditions || [],
    rounds: plan.rounds
  };
}

module.exports = { buildRegistry, buildTokenPolicyView };