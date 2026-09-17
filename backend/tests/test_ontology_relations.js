'use strict';

const assert = require('assert');
const { RELATION_TYPES, normalizeRelation } = require('../src/services/ontologyRelations');

const relation = normalizeRelation({
  source_kind: 'PhilosophicalConcept',
  source_id: 'language.sense',
  relation_type: 'contrasts_with',
  target_kind: 'PhilosophicalConcept',
  target_id: 'language.reference',
  confidence: 0.9,
  provenance: { sourceType: 'primary' }
});

assert.ok(RELATION_TYPES.includes(relation.relationType));
assert.equal(relation.confidence, 0.9);
assert.throws(() => normalizeRelation({ ...relation, relationType: 'invented_relation' }), /Unknown ontology relation type/);
assert.throws(() => normalizeRelation({ ...relation, confidence: 2 }), /between 0 and 1/);
assert.throws(() => normalizeRelation({ ...relation, targetId: '' }), /targetId/);

console.log('Ontology relation tests passed.');
