'use strict';
const assert = require('assert');
const biome = require('../src/services/biomeCoordinationService');

async function main() {
  console.log('Testing BiomeRuntime multi-tick loop...');

  const runtime = await biome.BiomeRuntime.create('test multi-tick resource allocation', {
    organization: 'energy_huddle',
    variant: 'resource'
  });

  console.log(`Created runtime: ${runtime.sessionId}, variant: ${runtime.variant}, tick: ${runtime.tick}`);

  const results = await runtime.run({
    populations: [
      { id: 'pop-1', demand: 100, priority: 1 },
      { id: 'pop-2', demand: 200, priority: 2 }
    ],
    totalBudget: 1000,
    allocate: true
  }, 10);

  console.log(`Ran ${results.length} ticks`);
  assert.ok(results.length > 0, 'Should have at least one tick');

  const finalResult = results[results.length - 1];
  console.log(`Final tick: ${finalResult.tick}, stopCondition: ${finalResult.stopCondition}`);
  assert.ok(finalResult.shouldStop || finalResult.tick === 10, 'Should stop or reach max ticks');

  const state = runtime.getState();
  console.log(`Final state - tick: ${state.tick}, populations: ${state.ecology.populations.length}`);
  assert.equal(state.tick, results.length, 'Tick should match result count');

  console.log('Testing different variant - exploration');
  const exploreRuntime = await biome.BiomeRuntime.create('test exploration multi-tick', {
    organization: 'energy_huddle',
    variant: 'exploration'
  });

  const exploreResults = await exploreRuntime.run({
    currentPatchId: 'patch-1',
    patchHistory: [],
    alternatives: [
      { patchId: 'patch-2', descriptor: 'new area', expectedInformationGain: 0.8, novelty: 0.7 },
      { patchId: 'patch-3', descriptor: 'another area', expectedInformationGain: 0.5, novelty: 0.4 }
    ],
    evidenceRefs: ['evidence-1'],
    execute: true
  }, 5);

  console.log(`Exploration ran ${exploreResults.length} ticks`);
  assert.ok(exploreResults.length > 0);

  console.log('Testing stop condition - budget exhausted');
  const budgetRuntime = await biome.BiomeRuntime.create('test budget exhaustion', {
    organization: 'energy_huddle',
    variant: 'resource'
  });

  const budgetResults = await budgetRuntime.run({
    populations: [{ id: 'pop-1', demand: 10000, priority: 1 }],
    totalBudget: 100,
    tokenCost: 10,
    allocate: true
  }, 20);

  const lastBudgetResult = budgetResults[budgetResults.length - 1];
  console.log(`Budget test - stopCondition: ${lastBudgetResult.stopCondition}`);
  assert.equal(lastBudgetResult.stopCondition, 'budget_exhausted', 'Should stop due to budget exhaustion');

  console.log('\n✅ All BiomeRuntime multi-tick loop tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });