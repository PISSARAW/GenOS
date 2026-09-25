'use strict';

const assert = require('node:assert/strict');
const { scoreTopology, weightedScore } = require('../src/services/morphogenesis/topologyResolverService');

function verifyCostFactors() {
  const { factors } = scoreTopology('biome', { currentState: { topology: 'rhizome' } });
  assert.equal(factors.coordination_overhead, 0.3);
  assert.equal(factors.transition_cost, 0.3);
  assert.equal(factors.state_preservation_cost, 0.4);
  assert.equal(factors.token_cost, 0.2);
  assert.equal(factors.latency, 0.2);
  assert.equal(factors.risk, 0.2);
  assert.equal(scoreTopology('biome', {}).factors.transition_cost, 0);
}

function verifyZeroProfileValues() {
  const result = scoreTopology('biome', { problemProfile: { needed_independence: 0 } });
  assert.equal(result.factors.epistemic_independence, 0.6);
}

function verifyCostsAreMonotonic() {
  const baseline = {
    coordination_overhead: 0.4, transition_cost: 0.4,
    state_preservation_cost: 0.4, token_cost: 0.4, latency: 0.4, risk: 0.4
  };
  const baselineScore = weightedScore(baseline);
  for (const factor of Object.keys(baseline)) {
    assert.ok(weightedScore({ ...baseline, [factor]: 0.5 }) < baselineScore, `${factor} must lower the score when it rises`);
  }
  assert.ok(weightedScore({ ...baseline, state_preservation_cost: 0.3 }) > baselineScore);
}

verifyCostFactors();
verifyZeroProfileValues();
verifyCostsAreMonotonic();
console.log('Topology resolver scoring checks: PASS');
