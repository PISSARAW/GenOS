'use strict';

const assert = require('node:assert/strict');
const { validateRegistry } = require('../src/philosophy/conceptRegistry');
const { compileRegistry, validateContract } = require('../src/philosophy/implementationContracts');
const { execute } = require('../src/philosophy/contractRuntime');
const { fixture } = require('../src/philosophy/contractExperiments');

const compiled = compileRegistry(validateRegistry().concepts);
assert.equal(compiled.valid, true, compiled.errors.join('; '));
assert.equal(compiled.specializedCount, 3);

const specialized = compiled.contracts.filter((contract) => contract.specializedMechanism);
assert.deepEqual(specialized.map((contract) => contract.id).sort(), [
  'core.biomimetic-experimental',
  'core.intervention-not-metaphor',
  'core.self',
]);

for (const contract of specialized) {
  assert.equal(contract.implementationDisposition, 'runtime-capability');
  assert.equal(contract.mechanismEvidence, 'specialized-runtime-capability-audit');
  assert.equal(contract.specializedMechanism.externalFactsVerified, false);
  assert.equal(contract.specializedMechanism.runtimeAuthorityGranted, false);
  assert.ok(contract.sourceRefs.includes('backend/src/philosophy/runtimeCapabilityAudits.js'));
  const satisfied = execute(contract, { observations: fixture(contract, 'satisfying') });
  const violated = execute(contract, { observations: fixture(contract, 'counterexample') });
  const missing = execute(contract);
  assert.equal(satisfied.assessment.status, 'satisfied');
  assert.equal(violated.assessment.status, 'violated');
  assert.equal(missing.assessment.status, 'unobserved');
  assert.ok(satisfied.assessment.details);
  assert.equal(satisfied.runtimeAuthority, false);
  assert.equal(satisfied.promotionEligible, false);
}

const self = specialized.find((contract) => contract.id === 'core.self');
const intervention = specialized.find((contract) => contract.id === 'core.intervention-not-metaphor');
const biomimetic = specialized.find((contract) => contract.id === 'core.biomimetic-experimental');
assert.equal(execute(self, { observations: fixture(self, 'satisfying') }).assessment.details.revisionDelta, 1);
assert.equal(execute(intervention, { observations: fixture(intervention, 'satisfying') }).assessment.details.measuredDelta, -3);
assert.equal(execute(biomimetic, { observations: fixture(biomimetic, 'satisfying') }).assessment.details.observedEffect, 1);

const forged = structuredClone(intervention);
forged.specializedMechanism.evaluator = 'identity-continuity';
assert.ok(validateContract(forged).some((error) => error.includes('specialized evaluator')));
assert.throws(() => execute(forged, { observations: fixture(intervention, 'satisfying') }), /specialized evaluator/);

const forgedOutputs = structuredClone(self);
forgedOutputs.specializedMechanism.outputs = ['identityStable', 'revisionDelta', 'lineageStable'];
assert.throws(() => execute(forgedOutputs, { observations: fixture(self, 'satisfying') }), /specialized outputs/);

const generic = compiled.contracts.find((contract) => contract.implementationDisposition !== 'runtime-capability');
assert.equal(generic.specializedMechanism, undefined);
assert.equal(validateContract(generic).length, 0);

console.log('Three runtime capabilities use specialized, calculated, non-authorizing audits.');
