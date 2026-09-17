'use strict';

const assert = require('assert');
const { listMappings, mappingForConcept } = require('../src/philosophy/runtimeMappings');
const { normalizeConcept } = require('../src/philosophy/conceptRegistry');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');

const mappings = listMappings();
assert.equal(mappings.length, 9);
assert.ok(mappings.every((item) => ['analogy', 'service'].includes(item.kind)));
assert.ok(mappings.every((item) => item.note.length > 0));

const legitimacy = normalizeConcept(CONCEPT_DEFINITIONS.find((item) => item.id === 'politics.legitimacy'));
assert.equal(legitimacy.mapping.target, 'agentEvidenceService');
assert.equal(legitimacy.mapping.kind, 'service');
assert.equal(mappingForConcept('unknown.concept'), null);

console.log('Runtime philosophy mappings tests passed.');
