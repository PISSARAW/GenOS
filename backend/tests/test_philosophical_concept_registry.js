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
assert.equal(concept.family, 'ontology');
assert.deepEqual(concept.genosDomains, ['ontology']);
assert.ok(Array.isArray(concept.relations));
assert.ok(Array.isArray(concept.adapters));
assert.equal(concept.family, concept.domain);
assert.deepEqual(concept.aliases, []);
assert.equal(concept.evidenceLevel, 'philosophical');
assert.equal(concept.mapping, null);
assert.equal(concept.serviceMaturity.level, 'implemented');
assert.equal(concept.serviceMaturity.executable, true);

const enriched = normalizeConcept({
  ...CONCEPT_DEFINITIONS[0],
  family: 'being',
  aliases: ['ens'],
  evidenceLevel: 'operational',
  mapping: { kind: 'service', target: 'ontologyCore', note: 'runtime mapping' }
});
assert.equal(enriched.family, 'being');
assert.deepEqual(enriched.aliases, ['ens']);
assert.equal(enriched.evidenceLevel, 'operational');
assert.equal(enriched.mapping.target, 'ontologyCore');

const consciousness = normalizeConcept({
  ...CONCEPT_DEFINITIONS.find((item) => item.id === 'metaphysics.qualia')
});
assert.deepEqual(consciousness.genosDomains, ['consciousness', 'phenomenology', 'wellbeing']);

const invalidDomain = validateRegistry([{
  ...CONCEPT_DEFINITIONS[0],
  genosDomains: ['unknown-subdomain']
}]);
assert.equal(invalidDomain.valid, false);
assert.ok(invalidDomain.errors.some((error) => error.includes('unknown GenOS subdomain')));

const qualia = normalizeConcept({
  ...CONCEPT_DEFINITIONS.find((item) => item.id === 'metaphysics.qualia')
});
assert.equal(qualia.serviceMaturity.service, 'consciousnessService');
assert.equal(qualia.serviceMaturity.level, 'partial');
assert.equal(qualia.serviceMaturity.executable, true);

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
