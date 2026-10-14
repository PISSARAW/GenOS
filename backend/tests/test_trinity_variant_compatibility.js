'use strict';

const assert = require('node:assert/strict');
const variants = require('../src/services/trinityVariantService');
const runtime = require('../src/services/trinityVariantRuntime');

const unsupported = [
  { worldTopology: 'factorial_grid', replicationPolicy: 'adaptive_budget_fixed_replicas' },
  { worldTopology: 'factorial_grid', interactionPolicy: 'adversarial_cross_examination' },
  { worldTopology: 'factorial_grid', objectivePolicy: 'multi_objective_scalarized' },
  { worldTopology: 'factorial_grid', hypothesisPolicy: 'counterfactual_dimensions' },
  { worldTopology: 'oracular_prediction', replicationPolicy: 'adaptive_replica_count' },
  { objectivePolicy: 'multi_objective_scalarized', replicationPolicy: 'quality_diversity_replicas' }
];
for (const design of unsupported) assert.throws(() => variants.compileExperimentalDesign(design),
  (error) => error.code === 'TRINITY_VARIANT_COMBINATION_UNSUPPORTED');
assert.throws(() => variants.compileExperimentalDesign({ temporalPolicy: 'multi_horizon_grid' }),
  (error) => error.code === 'TRINITY_POLICY_NOT_IMPLEMENTED');
assert.equal(runtime.run({ selection: {}, reports: [] }).status, 'not_required');
console.log('Trinity variant compatibility preflight: PASS');
