'use strict';

const assert = require('node:assert/strict');
const allocator = require('../src/services/biome/resources/ecologicalBudgetAllocator');
const ecologicalValue = require('../src/services/biome/resources/ecologicalValueService');
const { createNiche } = require('../src/services/biome/contracts/niche');
const { createPopulation } = require('../src/services/biome/contracts/population');

function run() {
  const signals = {
    marginalReturn: 2, informationGain: 3, criticality: 4,
    learningProgress: 0.5, keystoneValue: 2,
    cost: 2, pressure: 0.5, redundancy: 2, risk: 2
  };
  const scored = ecologicalValue.scorePopulation({
    population: { allocationSignals: signals },
    niche: { informationGain: 0, capacityKnown: true, carryingCapacity: 8, occupancy: 4 }
  });
  assert.equal(scored.value, 6);

  const niches = [
    createNiche({ nicheId: 'niche-a', status: 'open', informationGain: 1,
      resourceProfile: { tokens: { minimum: 1, preferred: 2, maximum: 10 } } }),
    createNiche({ nicheId: 'niche-b', status: 'open', informationGain: 1,
      resourceProfile: { tokens: { minimum: 1, preferred: 2, maximum: 10 } } })
  ];
  const populations = [
    createPopulation({ populationId: 'population-a', nicheId: 'niche-a', allocationSignals: { marginalReturn: 8 } }),
    createPopulation({ populationId: 'population-b', nicheId: 'niche-b', allocationSignals: { marginalReturn: 1 } })
  ];
  const result = allocator.allocateBudget({ available: { tokens: 10 }, populations, niches });
  assert.equal(result.allocations['population-a'].tokens + result.allocations['population-b'].tokens, 10);
  assert.ok(result.allocations['population-a'].tokens > result.allocations['population-b'].tokens);
  assert.equal(result.allocations['population-b'].tokens > 2, true);
  assert.equal(result.populationValues['population-a'], 8);
  assert.equal(result.populationValues['population-b'], 1);
  assert.throws(() => ecologicalValue.scorePopulation({ population: { allocationSignals: { cost: 0 } }, niche: {} }), {
    code: 'BIOME_ALLOCATION_SIGNAL_INVALID'
  });
  console.log('Biome ecological allocation checks: PASS');
}

run();
