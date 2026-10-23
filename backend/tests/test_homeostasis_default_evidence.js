'use strict';
const assert = require('assert');
const homeostasis = require('../src/services/homeostasisService');
const diagnostic = { objective: 'List the tests that would verify or refute each identity claim.' };
assert.equal(homeostasis.requiresTestSuiteEvidence(diagnostic), false);
assert.equal(homeostasis.defaultEvidenceRequirements(diagnostic).includes('test_suite_passed'), false);
assert.equal(homeostasis.buildDefaultFunctionalInvariants(diagnostic).some((item) => item.id === 'tests_pass'), false);
assert.equal(homeostasis.buildDefaultFunctionalInvariants({
  objective: 'Continue the user-authorized implementation until acceptance.'
}).some((item) => item.id === 'authentication_works'), false,
'authorization wording must not accidentally demand authentication checks');
assert.equal(homeostasis.buildDefaultFunctionalInvariants({ objective: 'Authentication must reject invalid credentials.' })
  .some((item) => item.id === 'authentication_works'), true);
for (const objective of ['Run the tests for the identity service.', 'Execute the test suite and report failures.', 'The tests must pass before completion.']) {
  const mission = { objective };
  assert.equal(homeostasis.requiresTestSuiteEvidence(mission), true, objective);
  assert.equal(homeostasis.defaultEvidenceRequirements(mission).includes('test_suite_passed'), true, objective);
  assert.equal(homeostasis.buildDefaultFunctionalInvariants(mission).some((item) => item.id === 'tests_pass'), true, objective);
}
assert.equal(homeostasis.requiresTestSuiteEvidence({ objective: 'Review identity behavior.', requiresTestSuite: true }), true);
console.log('homeostasis default test evidence contract: PASS');
