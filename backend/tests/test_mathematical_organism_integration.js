'use strict';

const assert = require('node:assert');
const math = require('../src/services/mathematical');

// === Math-1: Substrate ===
const env = math.createMathematicalEnvironment({
  problem: { statement: 'Conway-99', domain: 'combinatorics', constraints: ['99 nodes', 'no multiple edges'] },
  budget: { tokens: 5000 },
});

const lineage = math.createResearchLineage({
  name: 'conway-sat',
  strategies: ['representation_change', 'existing_theorem_retrieval'],
});

const niche = math.createMathematicalNiche({ name: 'SAT-formulation', representation: 'SAT' });
niche.addLineage(lineage);
niche.recordReturn(0.8, 10);

const artifact = math.createProofArtifact({
  type: 'lemma',
  statement: 'Conway-98 is solvable',
  domain: 'combinatorics',
});
artifact.attachReceipt({ status: 'passed', toolchainVersion: 'lean-4.9.0', receiptDigest: 'sha256:test' });

// === Math-2: Ecology ===
const pop = new math.MathematicalPopulation({ budget: { tokens: 1000 } });
pop.addLineage(lineage);
pop.evaluateFitness(lineage, { verifiedObligations: 2, totalObligations: 5, novelty: 0.6 });
const selected = pop.selectTop(2);
assert.ok(selected.length <= 2);

const nps = new math.MathematicalNichePopulationService();
nps.addNiche(niche);
assert.ok(nps.niches.size === 1);

const forager = new math.LiteratureForager();
forager.addPatch({ id: 'p1', statement: 'Conway-99: graph coloring problem', relevanceScore: 0.9 });
forager.enterPatch('p1');
forager.recordReturn(0.7);
const mvt = forager.shouldDepart();
assert.ok(typeof mvt.shouldDepart === 'boolean');

const mutationEngine = new math.MutationEngine({ mutationRate: 1.0, recombinationRate: 1.0, hgtRate: 1.0 });
const l2 = math.createResearchLineage({ name: 'l2', strategies: ['ring'] });
const recombined = mutationEngine.recombine(lineage, l2);
assert.ok(recombined !== null);

// === Math-3: Science ===
const culture = new math.MathematicalCulture();
const culturalArtifact = culture.addArtifact({ type: 'lemma', content: 'graph_coloring_bounds' });
const target = math.createResearchLineage({ name: 'cultural-target' });
culture.transmit(culturalArtifact.id, target);
assert.ok(target.genome.strategies.includes('graph_coloring_bounds'));

// === Integration: Conway-99 organism ===
env.addNiche(niche);
env.addLineage(lineage);
env.addArtifact(artifact);
const summary = env.summary();
assert.ok(summary.niches === 1);
assert.ok(summary.lineages === 1);

console.log('OK Math-1/2/3 integration: Mathematical Organism for Conway-99');
