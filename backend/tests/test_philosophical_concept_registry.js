'use strict';

const assert = require('assert');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');
const { normalizeConcept, validateRegistry, registryHealth } = require('../src/philosophy/conceptRegistry');

const health = registryHealth();
assert.equal(health.valid, true, health.errors.join('; '));
assert.equal(health.conceptCount, CONCEPT_DEFINITIONS.length);

const concept = normalizeConcept(CONCEPT_DEFINITIONS[0]);
assert.equal(concept.apiVersion, 'genos.philosophy/v1');
assert.equal(concept.kind, 'PhilosophicalConcept');
assert.ok(Array.isArray(concept.relations));
assert.ok(Array.isArray(concept.adapters));

const invalid = validateRegistry([{ ...CONCEPT_DEFINITIONS[0], id: 'Invalid ID' }]);
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.some((error) => error.includes('id')));

const dangling = validateRegistry([{
  ...CONCEPT_DEFINITIONS[0],
  relations: [{ type: 'depends_on', target: 'missing.concept' }]
}]);
assert.equal(dangling.valid, false);
assert.ok(dangling.errors.some((error) => error.includes('unknown concept')));

console.log('Philosophical concept registry tests passed.');
