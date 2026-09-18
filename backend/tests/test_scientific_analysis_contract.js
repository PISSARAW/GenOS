'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

const CASES = [
  ['method.hypothetico-deductive', { hypothesis: 'H', predictions: ['P'], observations: ['P'] }],
  ['science.confirmation', { hypothesis: 'H', observations: ['O'], compatible: true }],
  ['science.falsification-demarcation', { hypothesis: 'H', predicted: 'P', observed: 'O' }],
  ['science.duhem-quine', { hypothesis: 'H', auxiliaryAssumptions: ['A'], observedFailure: true }],
  ['truth.correspondence', { proposition: 'P', criterion: true }],
  ['truth.coherence', { proposition: 'P', criterion: true }],
  ['truth.pragmatist', { proposition: 'P', criterion: false }],
  ['truth.deflationary', { proposition: 'P', criterion: true }],
  ['truth.minimalism', { proposition: 'P', criterion: true }],
  ['truth.internal-realism', { proposition: 'P', criterion: true }],
  ['epistemology.skepticism', { claim: 'P', challenge: 'radical', evidenceCount: 1 }],
];

async function evaluate(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } },
  });
}

async function main() {
  for (const [concept, args] of CASES) {
    const result = await evaluate(concept, args);
    assert.equal(result.supported, true, concept);
    assert.equal(result.result.contractVersion, 'genos.philosophy-analysis/v1', concept);
    assert.equal(result.result.promotionEligible, false, concept);
    assert.equal(result.result.epistemic_context.interpretive, true, concept);
    assert.equal(result.result.epistemic_context.provenanceComplete, false, concept);
    assert.equal(result.result.epistemic_context.promotionEligible, false, concept);
    assert.ok(result.result.epistemic_context.methodology, concept);
  }
  await assert.rejects(
    () => evaluate('science.confirmation', { hypothesis: 'H', observations: 'not-an-array', compatible: true }),
    /observations must be an array/
  );
  await assert.rejects(
    () => evaluate('epistemology.skepticism', { claim: 'P', evidenceCount: -1 }),
    /evidenceCount must be a non-negative integer/
  );
  console.log('Scientific analysis contract: methods, truth theories and skepticism passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
