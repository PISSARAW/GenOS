'use strict';

const assert = require('node:assert');
const { createMathematicalEnvironment, MathematicalEnvironment } = require('../src/services/mathematical/mathematicalEnvironment');

// Basic creation
const env = createMathematicalEnvironment({
  problem: { statement: 'Prove that every even number > 2 is the sum of two primes', domain: 'number_theory' },
  budget: { tokens: 5000, cpu: 60 },
});
assert.ok(env.id);
assert.strictEqual(env.problem.domain, 'number_theory');
assert.strictEqual(env.problem.statement, 'Prove that every even number > 2 is the sum of two primes');
assert.ok(env.budget.tokens === 5000);

// With full problem structure
const env2 = createMathematicalEnvironment({
  problem: {
    statement: 'Conway-99',
    domain: 'combinatorics',
    assumptions: ['graph is undirected', '99 nodes'],
    constraints: ['no multiple edges', 'no self-loops'],
    knownResults: ['Conway-98 is solvable'],
  },
});
assert.strictEqual(env2.problem.assumptions.length, 2);
assert.strictEqual(env2.problem.constraints.length, 2);

// Niche/lineage/artifact tracking
env.addNiche({ id: 'sat-niche', kind: 'SAT' });
env.addLineage({ id: 'lineage-a', strategy: 'induction' });
env.addArtifact({ id: 'art-1', type: 'lemma' });
assert.strictEqual(env.niches.size, 1);
assert.strictEqual(env.lineages.size, 1);
assert.strictEqual(env.artifacts.size, 1);

const s = env.summary();
assert.ok(s.id);
assert.ok(s.niches === 1);

// Error on missing statement
assert.throws(() => createMathematicalEnvironment({ problem: '' }), /Mathematical statement is required/);

console.log('OK mathematicalEnvironment');
