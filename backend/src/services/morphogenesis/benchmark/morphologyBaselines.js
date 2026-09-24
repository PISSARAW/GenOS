'use strict';

const FIXED_TOPOLOGIES = Object.freeze([
  'a_team', 'biocenose', 'biome', 'holobionte', 'metapopulation', 'rhizome', 'syncytium', 'trinity'
]);

const BASELINES = Object.freeze([
  'single_model', 'best_simple_multi_agent', ...FIXED_TOPOLOGIES.map((name) => `fixed_${name}`),
  'fixed_hindsight_best', 'human_fixed_composite', 'flat_morphogenesis', 'dynamic_communication_only',
  'composite_without_transitions', 'composite_without_local_controllers',
  'composite_without_memory', 'composite_without_counterfactuals', 'full_morphogenesis'
]);

function baselineBudget(totalBudget, count = BASELINES.length) {
  return Number.isFinite(totalBudget) && totalBudget >= 0 ? totalBudget / Math.max(1, count) : 0;
}

module.exports = { BASELINES, FIXED_TOPOLOGIES, baselineBudget };
