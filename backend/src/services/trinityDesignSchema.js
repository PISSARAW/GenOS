'use strict';

function trinityDesignSchema() {
  return {
    worldTopology: { type: 'string', enum: ['fixed_three', 'factorial_grid'] },
    hypothesisPolicy: { type: 'string', enum: ['fixed_triplet', 'counterfactual_dimensions', 'novelty_seeking', 'recursive_decomposition', 'oracle_prediction'] },
    diversityPolicy: { type: 'string', enum: ['strategy_controlled', 'heterogeneous'] },
    interactionPolicy: { type: 'string', enum: ['sealed', 'adversarial_review_prep'] },
    objectivePolicy: { type: 'string', enum: ['shared_evidence_vector', 'pareto_orthogonal'] },
    temporalPolicy: { type: 'string', enum: ['single_horizon', 'short_medium_long'] },
    replicationPolicy: { type: 'string', enum: ['fixed_three', 'adaptive_budget_fixed_replicas', 'adaptive_replica_count'] },
    adjudicationPolicy: { type: 'string', enum: ['evidence_gated', 'blind_jury_advisory'] }
  };
}

module.exports = { trinityDesignSchema };
