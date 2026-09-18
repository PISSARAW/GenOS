'use strict';

const assert = require('node:assert/strict');
const {
  CONCEPT_DEFINITIONS,
  AESTHETICS_DEFINITIONS
} = require('../src/philosophy/conceptDefinitions');
const {
  normalizeConcept,
  validateRegistry,
  registryHealth
} = require('../src/philosophy/conceptRegistry');

function baseConcept() {
  return { ...CONCEPT_DEFINITIONS[0] };
}

function assertInvalid(concepts, expectedMessage) {
  const result = validateRegistry(concepts);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes(expectedMessage)), result.errors.join('; '));
}

const health = registryHealth();
assert.equal(health.valid, true, health.errors.join('; '));
assert.equal(health.conceptCount, CONCEPT_DEFINITIONS.length);
assert.deepEqual(health.duplicateIds, []);
assert.deepEqual(health.errors, []);

const ids = CONCEPT_DEFINITIONS.map((concept) => concept.id);
assert.equal(new Set(ids).size, ids.length);
assert.ok(AESTHETICS_DEFINITIONS.length > 0);
assert.ok(AESTHETICS_DEFINITIONS.some((concept) => concept.status === 'planned'));
assert.ok(AESTHETICS_DEFINITIONS.some((concept) => concept.status === 'implemented'));
assert.ok(AESTHETICS_DEFINITIONS.every((concept) => concept.family === 'aesthetics'));

const normalized = CONCEPT_DEFINITIONS.map(normalizeConcept);
assert.ok(normalized.every((concept) => concept.apiVersion === 'genos.philosophy/v1'));
assert.ok(normalized.every((concept) => concept.kind === 'PhilosophicalConcept'));
assert.ok(normalized.every((concept) => Array.isArray(concept.genosDomains)));
assert.ok(normalized.every((concept) => concept.serviceMaturity && typeof concept.serviceMaturity.executable === 'boolean'));

assertInvalid([baseConcept(), baseConcept()], 'duplicate concept ids');
assertInvalid([{ ...baseConcept(), id: 'Invalid ID' }], 'lowercase dot/dash segments');
assertInvalid([{ ...baseConcept(), label: '' }], 'label must be a non-empty string');
assertInvalid([{ ...baseConcept(), status: 'unknown-status' }], 'status must be one of');
assertInvalid([{ ...baseConcept(), relations: [{ type: 'depends_on', target: 'missing.concept' }] }], 'unknown concept');
assertInvalid([{ ...baseConcept(), genosDomains: ['not-a-genos-domain'] }], 'unknown GenOS subdomain');

console.log(`Philosophical registry health tests passed (${health.conceptCount} concepts).`);
