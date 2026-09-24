'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const populationService = require('../src/services/biome/populations/populationService');
const evolution = require('../src/services/biome/populations/populationEvolutionService');

async function run() {
  const session = await biome.composeBiome('Analyze logs and query data.', {
    environment: { opportunities: [
      { id: 'logs', descriptor: 'Analyze logs', opportunityScore: 0.8, evidenceRefs: ['artifact:logs'], requiredCapabilities: ['log-analysis'] },
      { id: 'sql', descriptor: 'Query data', opportunityScore: 0.7, evidenceRefs: ['artifact:data'], requiredCapabilities: ['sql'] }
    ] }
  });
  await biome.discoverSessionNiches(session.sessionId);
  await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-logs', options: { minimumOpportunityScore: 0.5 } });
  await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-sql', options: { minimumOpportunityScore: 0.5 } });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: { type: 'create', population: { populationId: 'logs-team', nicheId: 'niche-logs' } } });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: { type: 'create', population: { populationId: 'data-team', nicheId: 'niche-sql' } } });

  const spawned = await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'spawn', populationId: 'logs-team', individuals: [
      { individualId: 'worker-a', capabilities: ['log-analysis', 'sql'], fitnessReceipts: [{ score: 0.9 }] },
      { individualId: 'worker-b', role: 'reviewer', capabilities: ['log-analysis'], fitnessReceipts: [{ score: 0.4 }] }
    ]
  } });
  assert.equal(spawned.spawned.length, 2);
  assert.ok(spawned.population.diversity > 0);
  assert.equal((await biome.sessionSnapshot(session.sessionId)).niches.find((niche) => niche.nicheId === 'niche-logs').occupancy, 2);
  const selected = await biome.updateSessionPopulation({ sessionId: session.sessionId, command: { type: 'select', populationId: 'logs-team', count: 1 } });
  assert.equal(selected.population.individuals[0].individualId, 'worker-a');
  assert.equal(selected.removed, 1);

  const migrated = await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'migrate', sourcePopulationId: 'logs-team', targetPopulationId: 'data-team', individualId: 'worker-a'
  } });
  assert.equal(migrated.source.individuals.length, 0);
  assert.equal(migrated.target.individuals[0].individualId, 'worker-a');
  assert.equal(migrated.target.individuals[0].realizedNicheId, 'niche-sql');
  const afterMigration = await biome.sessionSnapshot(session.sessionId);
  assert.equal(afterMigration.niches.find((niche) => niche.nicheId === 'niche-logs').occupancy, 0);
  assert.equal(afterMigration.niches.find((niche) => niche.nicheId === 'niche-logs').status, 'open');
  assert.equal(afterMigration.niches.find((niche) => niche.nicheId === 'niche-sql').occupancy, 1);
  const sessionGrowth = await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'advance', populationId: 'data-team', measurements: { productivity: 1 }
  } });
  assert.equal(sessionGrowth.population.status, 'growing');
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'create', population: { populationId: 'data-team-temp', nicheId: 'niche-sql' }
  } });
  await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'spawn', populationId: 'data-team-temp', individuals: [{ individualId: 'worker-d', capabilities: ['sql'] }]
  } });
  const merged = await biome.updateSessionPopulation({ sessionId: session.sessionId, command: {
    type: 'merge', targetPopulationId: 'data-team', sourcePopulationId: 'data-team-temp'
  } });
  assert.equal(merged.population.individuals.length, 2);

  const growing = populationService.advance(migrated.target, { productivity: 1 });
  assert.equal(growing.status, 'growing');
  const established = populationService.advance({ ...growing, individuals: [...growing.individuals, { individualId: 'worker-c', capabilities: ['data'] }] }, { productivity: 1 });
  assert.equal(established.status, 'established');
  const saturated = populationService.advance(established, { carryingCapacity: 2, productivity: 1 });
  assert.equal(saturated.status, 'saturated');
  const declining = populationService.advance(saturated, { carryingCapacity: 2, productivity: 1, birthRate: 0, deathRate: 1 });
  assert.equal(declining.status, 'declining');
  const extinct = populationService.advance({ ...declining, individuals: [] }, { individuals: [] });
  assert.equal(extinct.status, 'dormant');
  const dead = populationService.advance(extinct, { individuals: [], extinctionConfirmed: true });
  assert.equal(dead.status, 'extinct');
  const recolonized = populationService.advance(dead, { individuals: [{ individualId: 'new-worker' }], recolonized: true });
  assert.equal(recolonized.status, 'recolonized');

  const frozen = evolution.freezeIndividual(migrated.target, 'worker-a', { trehalose: 0.9 });
  assert.equal(frozen.population.individuals.length, 0);
  assert.equal(frozen.population.status, 'dormant');
  const thawed = evolution.thawIndividual(frozen.population, 'worker-a');
  assert.equal(thawed.individual.individualId, 'worker-a');
  assert.equal(thawed.population.status, 'growing');

  const events = [];
  const db = {
    exec: async () => {},
    get: async () => null,
    run: async (...args) => { events.push(args); return { changes: 1 }; }
  };
  const evolved = await evolution.mutatePopulation(migrated.target, [
    { parentId: 'worker-a', individualId: 'worker-variant', strategy: 'invariant-verification', needs: ['analysis'] }
  ], { db });
  assert.equal(evolved.variants.length, 1);
  assert.equal(evolved.variants[0].genome.genomeRef.length > 0, true);
  assert.ok(events.length > 0);
  await assert.rejects(() => evolution.mutatePopulation(migrated.target, [], {}), { code: 'BIOME_EVOLUTION_DATABASE_REQUIRED' });

  const snapshot = await biome.sessionSnapshot(session.sessionId);
  assert.equal(snapshot.populations.length, 2);
  assert.equal(snapshot.populations.find((population) => population.populationId === 'data-team').status, 'growing');
  assert.equal(snapshot.populations.find((population) => population.populationId === 'logs-team').status, 'seed');
  console.log('Biome population checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
