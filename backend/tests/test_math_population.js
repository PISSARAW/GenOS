'use strict';

const assert = require('node:assert');
const { MathematicalPopulation } = require('../src/services/mathematical/mathematicalPopulation');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');

const pop = new MathematicalPopulation({ budget: { tokens: 1000 } });
const l1 = createResearchLineage({ name: 'l1' });
const l2 = createResearchLineage({ name: 'l2' });
const l3 = createResearchLineage({ name: 'l3' });
pop.addLineage(l1);
pop.addLineage(l2);
pop.addLineage(l3);
assert.strictEqual(pop.lineages.size, 3);

// Evaluate fitness
pop.evaluateFitness(l1, { verifiedObligations: 5, totalObligations: 10, novelty: 0.7 });
pop.evaluateFitness(l2, { verifiedObligations: 3, totalObligations: 10, novelty: 0.3 });
pop.evaluateFitness(l3, { verifiedObligations: 0, totalObligations: 10, novelty: 0 });

// Selection
const selected = pop.selectTop(2);
assert.ok(selected.length <= 2);

// Pareto dominance
const a = { P: 0.8, N: 0.7, I: 0.5, A: 0.6, T: 0.9, R: 0.8, C: 0.7 };
const b = { P: 0.5, N: 0.4, I: 0.3, A: 0.2, T: 0.6, R: 0.5, C: 0.4 };
assert.ok(MathematicalPopulation.dominates(a, b));
assert.ok(!MathematicalPopulation.dominates(b, a));

// Dormancy (before extinction removes it)
pop.dormant(l1.id);
assert.ok(l1._dormant === true);

// Extinction
for (let i = 0; i < 4; i++) pop.extinguish(0.1, 3);
assert.ok(pop.lineages.size < 3);

// Summary
const s = pop.summary();
assert.ok(s.id);
assert.ok(s.extinct >= 0);

console.log('OK Math-2 MathematicalPopulation');
