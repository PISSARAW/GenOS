'use strict';

function incompatibleFactorial(design) {
  return design.worldTopology === 'factorial_grid'
    && (design.replicationPolicy !== 'fixed_three'
      || design.objectivePolicy === 'multi_objective_scalarized'
      || design.interactionPolicy === 'adversarial_cross_examination'
      || design.hypothesisPolicy === 'counterfactual_dimensions');
}

function requiresFixedWorlds(design) {
  return design.worldTopology === 'oracular_prediction'
    || design.hypothesisPolicy === 'oracle_prediction'
    || design.objectivePolicy === 'multi_objective_scalarized'
    || design.interactionPolicy === 'adversarial_cross_examination'
    || design.hypothesisPolicy === 'counterfactual_dimensions';
}

function validate(design) {
  const incompatibleReplicas = requiresFixedWorlds(design)
    && design.replicationPolicy !== 'fixed_three';
  if (!incompatibleFactorial(design) && !incompatibleReplicas) return;
  throw Object.assign(new Error('Selected Trinity policies require incompatible world counts or an executor that is not implemented.'), {
    code: 'TRINITY_VARIANT_COMBINATION_UNSUPPORTED'
  });
}

module.exports = { validate };
