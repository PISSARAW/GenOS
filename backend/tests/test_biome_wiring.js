const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');

async function run() {
const composition = await biome.composeBiome('Operate an environment with specialized agent populations and shared resources.');
assert.equal(composition.members.length, 4);
assert.ok(composition.sessionId);
assert.equal(composition.organization, 'energy_huddle');
assert.deepEqual(composition.capabilityContract.required, ['SWARM_METRICS', 'TOKEN_ECONOMY']);
assert.deepEqual(composition.mechanisms, ['resource_allocation', 'optimal_foraging', 'quorum_sensing']);

const allocation = biome.allocateResources([
  { id: 'population_a', demand: 2, priority: 2 },
  { id: 'population_b', demand: 1, priority: 1 }
], { totalBudget: 100, minimumPerPopulation: 10 });
assert.equal(allocation.allocations[0].budget, 74);
assert.equal(allocation.allocations[1].budget, 26);
assert.equal(allocation.conserved, true);
const rounded = biome.allocateResources([
  { id: 'b', demand: 1, priority: 1 }, { id: 'a', demand: 1, priority: 1 }, { id: 'c', demand: 1, priority: 1 }
], { totalBudget: 10, minimumPerPopulation: 1 });
assert.equal(rounded.allocations.reduce((sum, item) => sum + item.budget, 0), 10);
assert.deepEqual(rounded.allocations.map((item) => item.budget), [4, 4, 2]);
assert.throws(() => biome.allocateResources([{ id: 'a', demand: 1, priority: 1 }], { totalBudget: 2, minimumPerPopulation: 3 }), { code: 'BIOME_ALLOCATION_INVALID' });
assert.throws(() => biome.allocateResources([{ id: 'a', demand: -1, priority: 1 }], { totalBudget: 2 }), { code: 'BIOME_ALLOCATION_INVALID' });
assert.throws(() => biome.allocateResources([{ id: 'a', demand: 1, priority: 1 }, { id: 'a', demand: 1, priority: 1 }], { totalBudget: 2 }), { code: 'BIOME_ALLOCATION_INVALID' });
const sessionAllocation = await biome.allocateSessionResources(composition.sessionId, [{ id: 'session_pop', demand: 1, priority: 1 }], { totalBudget: 20 });
assert.equal(sessionAllocation.allocations[0].budget, 20);

const step = biome.forageStep([{ infoGain: 3 }], { iteration: 3, elapsedTimeSec: 2 });
assert.ok(typeof step.patchYield.decision === 'string');
assert.ok(Number.isFinite(step.levyStep.stepLength));
assert.ok(typeof step.levyStep.mode === 'string');
await biome.forageSession(composition.sessionId, [{ infoGain: 3 }], { iteration: 2, elapsedTimeSec: 1 });

const resilient = biome.ecosystemHealth(['pollinate', 'graze', 'scout', 'harvest', 'migrate', 'burrow']);
assert.equal(resilient.verdict, 'resilient');
assert.equal(biome.ecosystemHealth([]).verdict, 'unknown');
await biome.assessSessionHealth(composition.sessionId, ['pollinate', 'graze']);
assert.equal((await biome.sessionSnapshot(composition.sessionId)).entries.length, 3);

await assert.rejects(() => biome.composeBiome(''), (error) => error.code === 'BIOME_MISSION_REQUIRED');
console.log('Biome wiring checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
