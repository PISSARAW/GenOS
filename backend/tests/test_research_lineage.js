'use strict';

const assert = require('node:assert');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');

// Test 1: Fork creates independent genome
const parent = createResearchLineage({
  name: 'parent',
  strategies: ['induction', 'contradiction'],
});

const child = parent.fork({ strategies: ['induction', 'omega'] });

// Mutate child
child.genome.strategies.push('ring');

// Parent must be unchanged
assert.ok(!parent.genome.strategies.includes('ring'), 'Parent genome must be isolated from child mutations');
assert.strictEqual(parent.genome.strategies.length, 2);

// Test 2: Deep clone of phenotype
const parent2 = createResearchLineage({
  name: 'parent2',
  strategies: ['rewrite'],
});

const child2 = parent2.fork();
child2.phenotype.activeTools.push('sat');

assert.ok(!parent2.phenotype.activeTools.includes('sat'), 'Parent phenotype must be isolated');

// Test 3: Parents tracked
assert.ok(child.parents.includes(parent.id));

console.log('OK ResearchLineage (isolation verified)');
