'use strict';

const assert = require('node:assert');
const { createResearchLineage, deepClone } = require('../src/services/mathematical/researchLineage');

// Test: fork isolation — mutating child must NOT affect parent
const parent = createResearchLineage({
  name: 'parent',
  strategies: ['induction', 'contradiction'],
});

const child = parent.fork({ strategies: ['induction', 'omega'] });

// Mutate child genome
child.genome.strategies.push('ring');
child.genome.representationOperators.push('SAT');

// Mutate child phenotype
child.phenotype.activeTools.push('sat-solver');
child.phenotype.currentRepresentation = 'SAT';

// Parent must be unchanged
assert.ok(!parent.genome.strategies.includes('ring'), 'Parent genome.strategies must be isolated');
assert.ok(!parent.genome.representationOperators.includes('SAT'), 'Parent genome.representationOperators must be isolated');
assert.ok(!parent.phenotype.activeTools.includes('sat-solver'), 'Parent phenotype.activeTools must be isolated');
assert.strictEqual(parent.phenotype.currentRepresentation, 'standard', 'Parent phenotype.currentRepresentation must be isolated');
assert.strictEqual(parent.genome.strategies.length, 2, 'Parent genome unchanged');

// Test: Deep clone of nested objects
const parent2 = createResearchLineage({
  name: 'parent2',
  strategies: ['rewrite'],
});

const child2 = parent2.fork();
child2.genome.researchPolicy.explorationRate = 0.9;

assert.notStrictEqual(parent2.genome.researchPolicy.explorationRate, 0.9, 'Parent researchPolicy must be isolated');

console.log('OK ResearchLineage (isolation verified)');
