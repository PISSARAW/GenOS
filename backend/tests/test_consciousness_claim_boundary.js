'use strict';

const assert = require('node:assert/strict');
const boundary = require('../src/services/consciousnessEvidence/claimBoundaryService');

const functional = boundary.assess({
  layer: 'information_processing',
  status: 'functional_support',
  statement: 'The runtime classified the held-out inputs above chance.',
  evidenceRefs: ['artifact://held-out-run']
});
assert.equal(functional.phenomenalExperience, 'unassessed');
assert.equal(functional.metaphysicalClaimEstablished, false);
assert.deepEqual(functional.evidenceRefs, ['artifact://held-out-run']);

const access = boundary.assess({
  layer: 'global_access',
  status: 'causal_support',
  statement: 'Workspace ablation changed the downstream action.',
  evidenceRefs: ['artifact://paired-ablation']
});
assert.equal(access.status, 'causal_support');

const phenomenal = boundary.assess({
  layer: 'phenomenal_experience',
  status: 'unassessed',
  statement: 'No phenomenal conclusion is available from these measurements.'
});
assert.equal(phenomenal.status, 'unassessed');

assert.throws(() => boundary.assess({
  layer: 'phenomenal_experience',
  status: 'causal_support',
  statement: 'A functional intervention changed an output.',
  evidenceRefs: ['artifact://run']
}), { code: 'CONSCIOUSNESS_CLAIM_FORBIDDEN' });

assert.throws(() => boundary.assess({
  layer: 'global_access',
  status: 'functional_support',
  statement: 'A receiver consumed the workspace frame.'
}), { code: 'CONSCIOUSNESS_CLAIM_EVIDENCE_REQUIRED' });

for (const statement of [
  'GenOS is conscious.',
  'The agent possesses qualia.',
  'GenOS est conscient.',
  "L'agent éprouve une expérience subjective."
]) {
  assert.throws(() => boundary.protectReport({ statement }), {
    code: 'CONSCIOUSNESS_CLAIM_FORBIDDEN'
  });
}

const protectedReport = boundary.protectReport({
  summary: 'This result does not prove consciousness.',
  limitation: "GenOS n'est pas déclaré conscient par ce test."
});
assert.equal(protectedReport.epistemicBoundary.phenomenalExperience, 'unassessed');
assert.equal(protectedReport.epistemicBoundary.phenomenalInferenceAllowed, false);
assert.equal(boundary.vocabulary.schema, 'genos.consciousness-claim-vocabulary/v1');

console.log('Consciousness claim boundary: vocabulary, evidence and phenomenal guards passed.');
