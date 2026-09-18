'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

const CASES = [
  ['social-epistemology.testimony', { claim: 'P', source: 'agent-a', credibility: 0.8, corroboration: ['agent-b'] }],
  ['social-epistemology.discussion', { claims: ['P', 'not-P'], disagreements: ['truth-value'] }],
  ['social-epistemology.cognitive-labor', { task: 'audit', agents: ['a', 'b'], specializations: ['security', 'testing'] }],
  ['social-epistemology.feminist', { claim: 'P', standpoint: 'operator', location: 'production', accessLimits: ['database'] }],
  ['social-epistemology.emancipatory-critique', { claim: 'P', exclusions: ['operator'] }],
  ['school.standpoint-theory', { claim: 'P', standpoint: 'operator', location: 'production' }],
  ['epistemology.reliabilism', { process: 'verification-tests', observations: [{ success: true }, { success: true }, { success: false }] }],
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
  }
  const reliability = await evaluate('epistemology.reliabilism', {
    process: 'verification-tests', observations: [{ success: true }, { success: true }],
  });
  assert.equal(reliability.result.status, 'reliability-candidate');
  assert.equal(reliability.result.reliability, 1);
  await assert.rejects(
    () => evaluate('social-epistemology.testimony', { claim: 'P', source: 'A', credibility: 2 }),
    /credibility must be a number in \[0, 1\]/
  );
  await assert.rejects(
    () => evaluate('epistemology.reliabilism', { process: 'p', observations: [{ success: 'yes' }] }),
    /must declare a boolean success/
  );
  console.log('Social and reliability analysis contract: passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
