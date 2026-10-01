'use strict';

const assert = require('node:assert/strict');
const experiments = require('../src/services/agow/agowExperimentService');

const required = ['regret_ablated', 'allostasis_ablated', 'counterfactual_ablated', 'active_query_ablated',
  'fast_plasticity_ablated', 'direct_pathway_ablated', 'proceduralization_ablated',
  'decompilation_ablated', 'distributed_market_ablated', 'provenance_ablated'];
for (const condition of required) assert(experiments.CONDITIONS.includes(condition), `${condition} condition exists`);
assert.equal(new Set(experiments.CONDITIONS).size, experiments.CONDITIONS.length);
console.log('✅ AGOW ablation conditions cover all proposed mechanisms');
