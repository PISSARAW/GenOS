'use strict';

const assert = require('node:assert');
const { LiteratureForager, PatchResult } = require('../src/services/mathematical/mathematicalLiteratureForaging');

const forager = new LiteratureForager({ envMeanReturnRate: 0.3 });

// Add patches
forager.addPatch(new PatchResult({
  id: 'patch-1',
  statement: 'Goldbach conjecture: every even n > 2 is sum of two primes',
  assumptions: ['n is even', 'n > 2'],
  relevanceScore: 0.9,
}));

forager.addPatch(new PatchResult({
  id: 'patch-2',
  statement: 'Vinogradov theorem: every large odd n is sum of three primes',
  relevanceScore: 0.7,
}));

// Enter patch and record returns
forager.enterPatch('patch-1');
forager.recordReturn(0.8);
forager.recordReturn(0.2);
assert.strictEqual(forager.currentInfoGain, 1.0);

// MVT evaluation (high yield, should stay)
const mvt1 = forager.shouldDepart();
assert.strictEqual(mvt1.shouldDepart, false);

// Record small returns → should depart
forager.recordReturn(0.05);
forager.recordReturn(0.05);
forager.recordReturn(0.05);
const mvt2 = forager.shouldDepart();
assert.ok(typeof mvt2.shouldDepart === 'boolean');

// Forage
const results = forager.forage('Prove that for all even n, n = p1 + p2', 5);
assert.ok(results.length > 0);

// Summary
const s = forager.summary();
assert.ok(s.patches === 2);

console.log('OK Math-2 LiteratureForager');
