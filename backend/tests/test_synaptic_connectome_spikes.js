const assert = require('assert');
const {
  computeSTDP,
  processSynapticSpikes,
  encodeCigarDiff
} = require('../src/services/synapticSpikeTrainService');

console.log('[Test] Running test_synaptic_connectome_spikes...');

// 1. Test plasticité STDP (Spike-Timing-Dependent Plasticity)
// t_post > t_pre -> potentialisation à long terme (LTP)
const ltp = computeSTDP(100, 110, 20.0);
assert.strictEqual(ltp.isPotentiation, true);
assert.ok(ltp.deltaWeight > 0);

// t_post < t_pre -> dépression à long terme (LTD)
const ltd = computeSTDP(120, 100, 20.0);
assert.strictEqual(ltd.isDepression, true);
assert.ok(ltd.deltaWeight < 0);

// 2. Traitement d'un train de spikes avec modulation par neurotransmetteurs
const synapse = { id: 'syn-77', weight: 1.0, lastSpikeMs: 1000 };
const spikes = [
  { transmitter: 'glutamate', timestampMs: 1010 },
  { transmitter: 'dopamine', timestampMs: 1025 },
  { transmitter: 'gaba', timestampMs: 1040 }
];

const processed = processSynapticSpikes(synapse, spikes);
assert.strictEqual(processed.synapseId, 'syn-77');
assert.strictEqual(processed.history.length, 3);
assert.ok(processed.finalWeight > 0);

// 3. Diff génomique CIGAR (bio-informatique)
const originalCode = ['const a = 1;', 'const b = 2;', 'return a + b;'];
const modifiedCode = ['const a = 1;', 'const b = 3;', 'return a + b;', 'console.log("done");'];

const diffResult = encodeCigarDiff(originalCode, modifiedCode);
assert.strictEqual(typeof diffResult.cigarString, 'string');
// doit contenir Match, eXchange (substitution), Insertion
assert.ok(diffResult.cigarString.includes('M'));
assert.ok(diffResult.cigarString.includes('X') || diffResult.cigarString.includes('I'));
assert.ok(diffResult.mutationCount >= 1);

console.log('[Test] test_synaptic_connectome_spikes PASSED successfully.');
