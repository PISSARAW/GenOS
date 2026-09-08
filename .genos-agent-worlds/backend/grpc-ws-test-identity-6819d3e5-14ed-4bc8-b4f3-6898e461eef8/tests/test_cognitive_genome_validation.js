const assert = require('node:assert/strict');
const { crossoverGenome } = require('../src/services/geneticsService');

const valid = { role: 'worker', strategy: 'review', tools: ['genos_inspect'], temp: 0.4, topP: 0.9 };
assert.throws(
  () => crossoverGenome({ genes: { ...valid, temp: undefined } }, { genes: valid }),
  /parentA\.temp/
);
assert.throws(
  () => crossoverGenome({ genes: { ...valid, tools: [] } }, { genes: valid }),
  /parentA\.tools/
);
console.log('Cognitive genomes are validated before crossover.');