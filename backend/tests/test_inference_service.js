'use strict';

const assert = require('node:assert/strict');
const inference = require('../src/services/inferenceService');
const router = require('../src/services/philosophyRouter');

const deduction = inference.inferDeductively({ premises: ['A', 'B'], conclusion: 'A' });
assert.equal(deduction.status, 'validity-candidate');
assert.equal(deduction.entailment, true);
assert.equal(deduction.soundness, 'undetermined');

const induction = inference.inferInductively({
  observations: ['raven-1 black', 'raven-2 black'],
  generalization: 'all ravens are black',
  counterexamples: ['raven-3 white'],
});
assert.equal(induction.status, 'weakened-support');
assert.equal(induction.support, 0.667);

const abduction = inference.inferAbductively({
  observations: ['service timeout'],
  hypotheses: [
    { id: 'network', explanation: 'network failure', score: 0.7 },
    { id: 'database', explanation: 'database overload', score: 0.9 },
  ],
});
assert.equal(abduction.status, 'best-explanation-candidate');
assert.equal(abduction.bestExplanation.id, 'database');

router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept: 'method.abduction', observations: ['timeout'], hypotheses: [{ id: 'h1', score: 1 }] } },
}).then((result) => {
  assert.equal(result.supported, true);
  assert.equal(result.result.bestExplanation.id, 'h1');
  console.log('Deduction, induction and abduction: PASS');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
