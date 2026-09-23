'use strict';

const assert = require('assert');
const {
  RELATION_DEFINITIONS,
  listRelations,
  registryHealth,
  validateRelations
} = require('../src/philosophy/relationRegistry');

const health = registryHealth();
assert.equal(health.valid, true, health.errors.join('; '));
assert.equal(health.relationCount, RELATION_DEFINITIONS.length);
assert.ok(health.relationTypes.includes('operationalizes'));
assert.ok(health.relationTypes.includes('caveat'));

const operationalizes = listRelations({ relationType: 'operationalizes' });
assert.ok(operationalizes.length > 0);
assert.ok(operationalizes.every((item) => item.relationType === 'operationalizes'));

const invalidTarget = validateRelations([{
  source: { kind: 'PhilosophicalConcept', id: 'metaphysics.dualism' },
  relationType: 'dependsOn',
  target: { kind: 'PhilosophicalConcept', id: 'missing.concept' }
}]);
assert.equal(invalidTarget.valid, false);
assert.ok(invalidTarget.errors.some((error) => error.includes('unknown concept')));

const duplicate = RELATION_DEFINITIONS[0];
const duplicateResult = validateRelations([duplicate, { ...duplicate }]);
assert.equal(duplicateResult.valid, false);
assert.ok(duplicateResult.errors.some((error) => error.includes('duplicate relations')));

console.log('Ontology relation registry tests passed.');
