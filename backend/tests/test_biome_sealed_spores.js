'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const populationService = require('../src/services/biome/populations/populationService');
const evolution = require('../src/services/biome/populations/populationEvolutionService');
const merge = require('../src/services/biome/populations/populationMergeService');

const previousKey = process.env.GENOS_SECRET_KEY;
process.env.GENOS_SECRET_KEY = randomBytes(32).toString('hex');

try {
  const population = populationService.normalizePopulation({
    populationId: 'population-a', nicheId: 'niche-a', status: 'growing',
    individuals: [{ individualId: 'agent-a', capabilities: ['private-capability'] }]
  });
  const frozen = evolution.freezeIndividual(population, 'agent-a');
  assert.equal(frozen.population.individuals.length, 0);
  assert.equal(frozen.population.spores.length, 1);
  const destination = populationService.normalizePopulation({ populationId: 'population-b', nicheId: 'niche-a' });
  assert.throws(() => merge.mergePopulations(destination, frozen.population),
    { code: 'BIOME_SPORE_TRANSFER_REQUIRES_RESEAL' });
  assert.equal(JSON.stringify(frozen.spore).includes('private-capability'), false);
  assert.throws(() => evolution.thawIndividual(frozen.population, 'agent-a'), /SPORE_ACCESS_DENIED/);
  assert.equal(frozen.population.spores.length, 1);

  const authorized = { authorizeSporeRead: (request) => request.operation === 'spore:thaw' };
  assert.throws(() => evolution.thawIndividual(frozen.population, 'agent-a', {
    ...authorized, environment: { warmAndWet: false }
  }), /DORMANT/);
  assert.throws(() => evolution.thawIndividual({ ...frozen.population, populationId: 'population-b' }, 'agent-a', authorized));
  assert.equal(frozen.population.spores.length, 1);
  const thawed = evolution.thawIndividual(frozen.population, 'agent-a', authorized);
  assert.equal(thawed.individual.individualId, 'agent-a');
  assert.equal(thawed.population.spores.length, 0);
  assert.equal(thawed.population.individuals.length, 1);
  console.log('Biome sealed spore checks: PASS');
} finally {
  if (previousKey === undefined) delete process.env.GENOS_SECRET_KEY;
  else process.env.GENOS_SECRET_KEY = previousKey;
}
