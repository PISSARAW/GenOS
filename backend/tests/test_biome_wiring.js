const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');

const composition = biome.composeBiome('Operate an environment with specialized agent populations and shared resources.');
assert.equal(composition.members.length, 4);
assert.equal(composition.organization, 'energy_huddle');
assert.ok(composition.capabilityContract.required.includes('STIGMERGY'));
assert.ok(composition.capabilityContract.required.includes('SWARM_METRICS'));
assert.ok(composition.capabilityContract.required.includes('WEB_FORAGING'));
assert.deepEqual(composition.mechanisms, ['resource_allocation', 'optimal_foraging', 'quorum_sensing']);

const allocation = biome.allocateResources([
  { id: 'population_a', demand: 2, priority: 2 },
  { id: 'population_b', demand: 1, priority: 1 }
], { totalBudget: 100, minimumPerPopulation: 10 });
assert.equal(allocation.allocations[0].budget, 74);
assert.equal(allocation.allocations[1].budget, 26);
assert.equal(allocation.conserved, true);

const step = biome.forageStep([{ infoGain: 3 }], { iteration: 3, elapsedTimeSec: 2 });
assert.ok(typeof step.patchYield.decision === 'string');
assert.ok(Number.isFinite(step.levyStep.stepLength));
assert.ok(typeof step.levyStep.mode === 'string');

const resilient = biome.ecosystemHealth(['pollinate', 'graze', 'scout', 'harvest', 'migrate', 'burrow']);
assert.equal(resilient.verdict, 'resilient');
assert.equal(biome.ecosystemHealth([]).verdict, 'unknown');

assert.throws(() => biome.composeBiome(''), (error) => error.code === 'BIOME_MISSION_REQUIRED');
console.log('Biome wiring checks: PASS');
