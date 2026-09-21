'use strict';

const assert = require('node:assert');
const A = require('../src/services/epistemic/affinityMaturationService');

// ---- diagnostic d'erreur ----

assert.strictEqual(A.diagnoseError({ falsePositive: true }, { trueValue: true }), 'false_positive');
assert.strictEqual(A.diagnoseError({ falseNegative: true }, { trueValue: false }), 'false_negative');
assert.strictEqual(A.diagnoseError({ complete: false }, {}), 'incomplete');
assert.strictEqual(A.diagnoseError({ complete: true }, { trueValue: true }), 'no_error');
assert.strictEqual(A.diagnoseError(null, {}), 'incomplete');

// ---- mutation ciblée ----

assert.strictEqual(A.targetedMutation('false_positive'), 'narrow_scope');
assert.strictEqual(A.targetedMutation('false_negative'), 'add_counterexample');
assert.strictEqual(A.targetedMutation('incomplete'), 'deepen_search');
assert.strictEqual(A.targetedMutation('no_error'), 'swap_steps');

// ---- application de mutation ----

const s = ['étape1', 'étape2'];

const withCounter = A.applyMutation(s, 'add_counterexample');
assert.strictEqual(withCounter.length, 3);
assert.strictEqual(withCounter[2], 'générer contre-exemple');

const withBoundary = A.applyMutation(s, 'add_boundary_test');
assert.strictEqual(withBoundary.length, 3);

const deepened = A.applyMutation(s, 'deepen_search');
assert.strictEqual(deepened.length, 3);

const narrowed = A.applyMutation(['recherche', 'analyse'], 'narrow_scope');
assert.strictEqual(narrowed.length, 1);
assert.strictEqual(narrowed[0], 'analyse');

const swapped = A.applyMutation(['a', 'b', 'c'], 'swap_steps');
assert.strictEqual(swapped[0], 'b');
assert.strictEqual(swapped[1], 'a');

// ---- maturation de stratégie ----

const verification = {
  strategy: ['recherche', 'analyse'],
  falsePositive: true,
  complete: true,
};
const oracleTruth = { trueValue: false };

const result = A.matureStrategy(verification, oracleTruth);
assert.strictEqual(result.diagnosis, 'false_positive');
assert.strictEqual(result.mutation, 'narrow_scope');
assert.strictEqual(result.newStrategy.length, 1); // narrow_scope retire 'recherche'
assert.strictEqual(result.newStrategy[0], 'analyse');

// ---- historique Brier ----

const history = A.updateBrierHistory([0.42], 0.28);
assert.deepStrictEqual(history, [0.42, 0.28]);

// ---- adoption de mutation ----

assert.strictEqual(A.shouldAdoptMutation([], 0.28), true);
assert.strictEqual(A.shouldAdoptMutation([0.42, 0.35], 0.28), true); // amélioration
assert.strictEqual(A.shouldAdoptMutation([0.42, 0.35], 0.50), false); // dégradation

console.log('OK affinityMaturationService');
