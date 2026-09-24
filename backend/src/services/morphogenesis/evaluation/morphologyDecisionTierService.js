'use strict';

function selectDecisionTier(input = {}) {
  const uncertainty = Number.isFinite(input.uncertainty) ? input.uncertainty : 1;
  const highStakes = input.highStakes === true;
  const costlyTransition = input.costlyTransition === true;
  if (input.knownPatternStrongEvidence === true && uncertainty <= 0.2 && !highStakes && !costlyTransition) {
    return { tier: 'cheap', action: 'direct_plan', arenaRequired: false };
  }
  if (uncertainty <= 0.6 && !highStakes && !costlyTransition) {
    return { tier: 'medium', action: 'compare_predicted_utilities', arenaRequired: false };
  }
  return { tier: 'expensive', action: 'counterfactual_arena', arenaRequired: true };
}

module.exports = { selectDecisionTier };
