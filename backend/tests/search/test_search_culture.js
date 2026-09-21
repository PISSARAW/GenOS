const assert = require('node:assert/strict')
const { SearchCultureService } = require('../../src/services/search/searchCultureService')
const { createRandomGenome } = require('../../src/services/search/searchGenomeService')

{
  const culture = new SearchCultureService();
  const genome = createRandomGenome();
  const plasmid = culture.compilePlasmid(genome, {
    environment: 'test-env',
    generations: 5,
    successRate: 0.8,
    reproducible: true
  });
  assert.ok(plasmid.id, 'plasmid has ID');
  assert.ok(plasmid.trait, 'plasmid has trait');
  assert.equal(plasmid.transmissions, 0, 'no transmissions yet');
}

{
  const culture = new SearchCultureService();
  const genome = createRandomGenome();
  const plasmid = culture.compilePlasmid(genome, { environment: 'test-env', generations: 5, successRate: 0.8, reproducible: true });
  const tx = culture.transmit(plasmid.id, 'agent-2');
  assert.ok(tx, 'transmission recorded');
  assert.equal(plasmid.transmissions, 1, 'transmission count incremented');
}

console.log('Search Culture tests passed.')
