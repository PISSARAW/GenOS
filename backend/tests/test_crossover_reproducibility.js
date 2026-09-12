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

const crypto = require('crypto');
function hashCrossover(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
const keyBase = hashCrossover({ version: 'genos-crossover-v1', parentA: 'pA', parentB: 'pB', genesA: { a: 1 }, genesB: { b: 2 }, swapProb: 0.5, crossoverPoint: null, speciationThreshold: null, seed: 'seed' });
const keyDiffGenes = hashCrossover({ version: 'genos-crossover-v1', parentA: 'pA', parentB: 'pB', genesA: { a: 999 }, genesB: { b: 2 }, swapProb: 0.5, crossoverPoint: null, speciationThreshold: null, seed: 'seed' });
const keyDiffThreshold = hashCrossover({ version: 'genos-crossover-v1', parentA: 'pA', parentB: 'pB', genesA: { a: 1 }, genesB: { b: 2 }, swapProb: 0.5, crossoverPoint: null, speciationThreshold: 0.8, seed: 'seed' });

assert.notStrictEqual(keyBase, keyDiffGenes);
assert.notStrictEqual(keyBase, keyDiffThreshold);

console.log('Crossover reproducibility checks passed.');