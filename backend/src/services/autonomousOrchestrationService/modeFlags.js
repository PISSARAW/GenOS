const { listStrategies } = require('../../strategies/strategyRegistry');

function selected(contract, id) {
  return contract.selected_strategy?.primary === id;
}

function hasTrait(contract, trait) {
  const primary = contract.selected_strategy?.primary;
  const strategy = listStrategies().find((entry) => entry.id === primary);
  return Boolean(strategy?.traits.includes(trait));
}

function modeFlags(contract) {
  return {
    competition: selected(contract, 'strategy_arena') || selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'multi_objective'),
    evolution: selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'mutation')
  };
}

module.exports = { modeFlags, selected, hasTrait };
