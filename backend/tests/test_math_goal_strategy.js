'use strict';

const assert = require('node:assert');
const { extractEpitopes, epitopeSignature } = require('../src/services/mathematical/goalEpitopeExtractor');
const { ProofStrategyRepertoire } = require('../src/services/mathematical/proofStrategyRepertoire');

// GoalEpitopeExtractor — quantifier + equality
const e1 = extractEpitopes('Prove that for all n, if n is even then n = p1 + p2');
assert.ok(e1.epitopes.hasQuantifier);
assert.ok(e1.epitopes.isEquality);
assert.ok(e1.epitopes.hasImplication);

const e2 = extractEpitopes('');
assert.deepStrictEqual(e2.epitopes, {});
assert.deepStrictEqual(e2.operators, []);

const e3 = extractEpitopes('Prove by induction that for all n, sum(1..n) = n(n+1)/2');
assert.ok(e3.epitopes.hasQuantifier);
assert.ok(e3.epitopes.isEquality);
assert.ok(e3.operators.includes('induction'));
assert.ok(e3.operators.includes('rewrite'));

// Signature
const sig = epitopeSignature({ a: true, b: false, c: true });
assert.strictEqual(sig, 'a|c');

// ProofStrategyRepertoire
const rep = new ProofStrategyRepertoire();
const goal = 'Prove by induction that sum(1..n) = n(n+1)/2';
const selected = rep.selectForGoal(goal, 3);
assert.ok(selected.length <= 3);
assert.ok(selected[0].fit >= selected[1].fit);

// Record outcome
rep.recordOutcome('induction', true);
const ind = rep.catalog.get('induction');
assert.strictEqual(ind.successCount, 1);
assert.strictEqual(ind.trialCount, 1);

// Mutate (deterministic with rate=1)
const mutated = rep.mutate(1.0);
assert.ok(mutated !== null || rep.strategies.length >= 10);

console.log('OK Math-2 GoalEpitopeExtractor + ProofStrategyRepertoire');
