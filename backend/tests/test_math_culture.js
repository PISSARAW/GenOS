'use strict';

const assert = require('node:assert');
const { MathematicalCulture } = require('../src/services/mathematical/mathematicalCultureService');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');

const culture = new MathematicalCulture({ fidelityRate: 0.9 });

// Test 1: Verified lemma goes to knowledge, not strategies
const lemma = culture.addArtifact({
  type: 'lemma',
  content: 'graph_coloring_bounds',
  source: 'goldbach-lineage',
  verified: true,
});
assert.ok(lemma.id);

const target1 = createResearchLineage({ name: 'target1' });
culture.transmit(lemma.id, target1);
assert.ok(target1._knowledge, 'Target should have knowledge base');
assert.ok(target1._knowledge.length === 1);
assert.ok(!target1.genome.strategies.includes('graph_coloring_bounds'), 'Lemma should not be a strategy');

// Test 2: Unverified heuristic goes to strategies
const heuristic = culture.addArtifact({
  type: 'heuristic',
  content: 'try_induction_first',
  verified: false,
});

const target2 = createResearchLineage({ name: 'target2' });
culture.transmit(heuristic.id, target2);
assert.ok(target2.genome.strategies.includes('try_induction_first'), 'Heuristic should be a strategy');

// Test 3: Selection
const artifact2 = culture.addArtifact({ type: 'tactic', content: 'sieve_approach', verified: true });
const selected = culture.selectForTransmission(artifact2.id, target2);
assert.ok(selected !== null);

// Summary
const s = culture.summary();
assert.ok(s.artifacts >= 2);
assert.ok(s.transmissions >= 1);

console.log('OK MathematicalCulture (verified vs unverified separation)');
