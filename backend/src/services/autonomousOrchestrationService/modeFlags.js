const { listStrategies } = require('../../strategies/strategyRegistry');

function selected(contract, id) {
  return (contract.strategy_portfolio || []).some((strategy) => strategy.id === id);
}

function hasTrait(contract, trait) {
  const registry = new Map(listStrategies().map((strategy) => [strategy.id, strategy]));
  return (contract.strategy_portfolio || []).some((strategy) => registry.get(strategy.id)?.traits.includes(trait));
}

function modeFlags(contract) {
  return {
    competition: selected(contract, 'strategy_arena') || selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'multi_objective'),
    evolution: selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'mutation')
  };
}

module.exports = { modeFlags, selected, hasTrait };