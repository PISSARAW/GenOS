'use strict';

const assert = require('node:assert/strict');
const { sealConstitution } = require('../src/services/governedEvolution/constitution');
const { createChangeHypothesis } = require('../src/services/governedEvolution/hypothesisService');

const constitution = sealConstitution({
  constitutionId: 'genos-core',
  version: '1',
  protectedPathPrefixes: ['backend/src/security', 'docs/constitution'],
  immutableRules: ['no_self_promotion', 'independent_authorization']
});

const input = {
  kind: 'scaffold',
  proposerId: 'builder-a',
  parentRevision: 'rev-1',
  candidateRevision: 'rev-2',
  rollbackRef: 'snapshot-rev-1',
  claims: ['Le scaffold réduit les erreurs sur les tâches réelles'],
  operations: [{ path: 'backend/src/scaffolds/planner.js', action: 'create' }],
  constitution
};

const hypothesis = createChangeHypothesis(input);
assert.equal(hypothesis.status, 'HYPOTHESIS');
assert.equal(hypothesis.promotionEligible, false);
assert.equal(hypothesis.parentRevision, 'rev-1');
assert.equal(hypothesis.rollbackRef, 'snapshot-rev-1');
assert.equal(createChangeHypothesis(input).hypothesisId, hypothesis.hypothesisId);

assert.throws(() => createChangeHypothesis({
  ...input,
  operations: [{ path: 'backend/src/security/gate.js', action: 'modify' }]
}), { code: 'GOVERNED_EVOLUTION_CONSTITUTION_PROTECTED' });

assert.throws(() => createChangeHypothesis({
  ...input,
  constitution: { ...constitution, immutableRules: ['self_promotion_allowed'] }
}), { code: 'GOVERNED_EVOLUTION_CONSTITUTION_TAMPERED' });

console.log('Governed evolution hypothesis checks passed.');
