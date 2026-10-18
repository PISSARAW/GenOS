'use strict';

const assert = require('node:assert/strict');
const { validateRegistry, registryHealth } = require('../src/philosophy/conceptRegistry');
const { compileRegistry, validateContract } = require('../src/philosophy/implementationContracts');
const { pageContracts } = require('../src/philosophy/contractPagination');

const EXPECTED_COUNTS = Object.freeze({
  'reference-only': 195,
  'bounded-audit': 222,
  'runtime-capability': 3,
});

const registry = validateRegistry();
assert.equal(registry.valid, true, registry.errors.join('; '));
assert.deepEqual(registryHealth().dispositionCounts, EXPECTED_COUNTS);

for (const concept of registry.concepts) {
  const details = concept.implementationDispositionDetails;
  assert.equal(details.name, concept.implementationDisposition);
  assert.equal(details.sourceServiceExecutable, concept.serviceMaturity.executable);
  assert.equal(details.runtimeAuthorityGranted, false);
  assert.equal(details.promotionEligible, false);
  if (concept.implementationDisposition === 'reference-only') {
    assert.equal(concept.serviceMaturity.executable, false);
  }
  if (concept.implementationDisposition === 'bounded-audit') {
    assert.equal(concept.serviceMaturity.executable, true);
    assert.equal(concept.runtimeAuthority, false);
  }
  if (concept.implementationDisposition === 'runtime-capability') {
    assert.equal(concept.serviceMaturity.executable, true);
    assert.equal(concept.runtimeAuthority, true);
  }
}

const compiled = compileRegistry(registry.concepts);
assert.equal(compiled.valid, true, compiled.errors.join('; '));
assert.deepEqual(compiled.dispositionCounts, EXPECTED_COUNTS);
assert.ok(compiled.contracts.every((contract) => contract.runtimeAuthority === false));
assert.ok(compiled.contracts.every((contract) => contract.implementationDispositionDetails.promotionEligible === false));

const filtered = pageContracts(compiled.contracts, { implementationDisposition: 'reference-only' });
assert.equal(filtered.total, EXPECTED_COUNTS['reference-only']);
assert.ok(filtered.contracts.every((contract) => contract.implementationDisposition === 'reference-only'));

const reference = compiled.contracts.find((contract) => contract.implementationDisposition === 'reference-only');
const forged = {
  ...reference,
  implementationDisposition: 'runtime-capability',
  implementationDispositionDetails: {
    ...reference.implementationDispositionDetails,
    name: 'runtime-capability',
    runtimeCapability: true,
  },
};
assert.ok(validateContract(forged).some((error) => error.includes('implementationDisposition')));

console.log('Philosophy implementation dispositions passed: 195 reference-only, 222 bounded-audit, 3 runtime-capability.');
