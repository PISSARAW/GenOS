const assert = require('node:assert/strict')
const { SearchEvolutionEngine } = require('../../src/services/search/searchEvolutionService')

{
  const engine = new SearchEvolutionEngine({ populationSize: 6 });
  engine.initialize();
  assert.equal(engine.population.length, 6, 'population created');
  assert.equal(engine.generation, 0, 'starts at generation 0');
}

{
  const engine = new SearchEvolutionEngine({ populationSize: 6 });
  engine.initialize();
  const env = {
    successfulFamilies: ['cache'],
    failedFamilies: ['race-condition'],
    recommendedStrategies: ['causal-debugging']
  };

  const result = engine.evolve(env);
  assert.equal(engine.generation, 1, 'generation incremented');
  assert.ok(result, 'evolution result returned');
}

console.log('Search Evolution tests passed.')
