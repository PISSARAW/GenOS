'use strict';

const assert = require('node:assert');
const { createResearchLineage, STRATEGY_TYPES } = require('../src/services/mathematical/researchLineage');

const lineage = createResearchLineage({
  name: 'goldbach-induction',
  strategies: ['induction', 'contradiction'],
});
assert.ok(lineage.id);
assert.strictEqual(lineage.genome.strategies.length, 2);
assert.strictEqual(lineage.generation, 0);

// Fork
const child = lineage.fork({ strategies: ['induction', 'omega'] });
assert.strictEqual(child.generation, 1);
assert.ok(child.parents.includes(lineage.id));

// Mutate (deterministic with rate=1)
const result = lineage.mutate(1.0);
// With rate=1, should attempt mutation
assert.ok(typeof result.mutated === 'boolean');

// Summary
const s = lineage.summary();
assert.ok(s.id);
assert.ok(s.strategies.length >= 2);

console.log('OK researchLineage');
