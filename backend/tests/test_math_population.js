'use strict';

const assert = require('node:assert');
const { MathematicalPopulation } = require('../src/services/mathematical/mathematicalPopulation');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');

// Test 1: Pareto front selection
const pop = new MathematicalPopulation({ budget: { tokens: 1000 } });
const l1 = createResearchLineage({ name: 'l1' });
const l2 = createResearchLineage({ name: 'l2' });
const l3 = createResearchLineage({ name: 'l3' });

pop.addLineage(l1);
pop.addLineage(l2);
pop.addLineage(l3);

// l1 dominates l2 (all dimensions higher)
pop.evaluateFitness(l1, { verifiedObligations: 9, totalObligations: 10, novelty: 0.9, informationGain: 0.9, affordancesCreated: 5, transferability: 0.9, resistanceToFalsification: 0.9, cost: 100 });
pop.evaluateFitness(l2, { verifiedObligations: 2, totalObligations: 10, novelty: 0.2, informationGain: 0.2, affordancesCreated: 1, transferability: 0.2, resistanceToFalsification: 0.2, cost: 900 });
pop.evaluateFitness(l3, { verifiedObligations: 8, totalObligations: 10, novelty: 0.7, informationGain: 0.7, affordancesCreated: 4, transferability: 0.7, resistanceToFalsification: 0.7, cost: 200 });

const selected = pop.selectTop(2);
const selectedIds = selected.map(l => l.id);

// l1 (dominant) must be selected
assert.ok(selectedIds.includes(l1.id), 'Dominant lineage must be in top selection');
// l2 (dominated) must NOT be in top 2 if better alternatives exist
assert.ok(!selectedIds.includes(l2.id), 'Dominated lineage must not be preferred');

// Test 2: Fitness actually influences ranking
const selectedTop1 = selected[0];
assert.ok(selectedTop1.id === l1.id, 'Best lineage should be first (highest fitness)');

console.log('OK MathematicalPopulation (Pareto selection verified)');
