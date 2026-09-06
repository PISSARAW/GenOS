const assert = require('assert');
const { crossoverGenome } = require('../src/services/geneticsService');

const parentA = {
  name: 'Display name A',
  genes: { role: 'architect', strategy: 'verify', tools: ['genos_snapshot', 'genos_test'], temp: 0.4, topP: 0.9 }
};
const parentB = {
  name: 'Display name B',
  genes: { role: 'reviewer', strategy: 'falsify', tools: ['genos_fork', 'genos_replay'], temp: 0.6, topP: 0.8 }
};

const first = crossoverGenome(parentA, parentB, { strategy: 'uniform', mutationRate: 0.5, seed: 'replay-seed' });
const second = crossoverGenome({ ...parentA, name: 'Renamed A' }, { ...parentB, name: 'Renamed B' }, { strategy: 'uniform', mutationRate: 0.5, seed: 'replay-seed' });

assert.deepStrictEqual(second.childGenes, first.childGenes);
assert.strictEqual(second.genomeHash, first.genomeHash);
assert.strictEqual(second.reproducibilitySeed, first.reproducibilitySeed);
assert.notStrictEqual(second.childId, first.childId, 'runtime IDs remain unique even when content is replayable');

console.log('Crossover reproducibility checks passed.');