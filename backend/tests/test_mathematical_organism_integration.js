'use strict';

const assert = require('node:assert');
const math = require('../src/services/mathematical');

// Test: MathematicalOrganismRuntime simulation
const env = math.createMathematicalEnvironment({
  problem: { statement: 'Conway-99', domain: 'combinatorics' },
  budget: { tokens: 5000 },
});

const nps = new math.MathematicalNichePopulationService();

// Create niches
const satNiche = env.createNiche({ name: 'SAT', representation: 'SAT' });
const algNiche = env.createNiche({ name: 'Algebraic', representation: 'algebraic' });

nps.addNiche(satNiche);
nps.addNiche(algNiche);

// Record some returns so allocation has data
satNiche.recordReturn(0.8, 10);
algNiche.recordReturn(0.5, 10);

// Create lineages
const l1 = math.createResearchLineage({ name: 'lineage-sat', strategies: ['representation_change'] });
const l2 = math.createResearchLineage({ name: 'lineage-alg', strategies: ['ring'] });

// Allocate
nps.allocateToBestNiche(l1);
nps.allocateToBestNiche(l2);

// Evaluate fitness
const pop = satNiche.population;
pop.evaluateFitness(l1, { verifiedObligations: 2, totalObligations: 5, novelty: 0.6 });

// Culture
const culture = new math.MathematicalCulture();
const culturalArtifact = culture.addArtifact({ type: 'lemma', content: 'graph_coloring_bounds', verified: true });
culture.transmit(culturalArtifact.id, l2);

// Verify integration
assert.ok(nps.niches.size === 2);
assert.ok(l2._knowledge && l2._knowledge.length === 1, 'Lineage should have received cultural knowledge');

console.log('OK MathematicalOrganismRuntime simulation');
