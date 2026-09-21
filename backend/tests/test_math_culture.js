'use strict';

const assert = require('node:assert');
const { MathematicalCulture } = require('../src/services/mathematical/mathematicalCultureService');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');

const culture = new MathematicalCulture({ fidelityRate: 0.9 });
const artifact = culture.addArtifact({
  type: 'lemma',
  content: 'every_even_is_sum_of_two_primes',
  source: 'goldbach-lineage',
});
assert.ok(artifact.id);
assert.strictEqual(artifact.fidelity, 1.0);

// Transmit
const target = createResearchLineage({ name: 'target' });
const transmitted = culture.transmit(artifact.id, target);
assert.ok(transmitted);
assert.strictEqual(transmitted.generation, 1);
assert.ok(transmitted.fidelity < 1.0);
assert.ok(target.genome.strategies.includes('every_even_is_sum_of_two_primes'));

// Selection
const artifact2 = culture.addArtifact({ type: 'method', content: 'sieve_approach' });
const selected = culture.selectForTransmission(artifact2.id, target);
assert.ok(selected !== null);

// Summary
const s = culture.summary();
assert.ok(s.artifacts >= 2);
assert.ok(s.transmissions >= 1);

console.log('OK Math-3 MathematicalCultureService');
