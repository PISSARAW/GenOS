'use strict';

const { CONCEPT_DEFINITIONS } = require('./conceptDefinitions');
const { validateSpec } = require('../services/specValidator');

const RELATION_SCHEMA = 'ontology-relation.schema.json';
const CONCEPT_KIND = 'PhilosophicalConcept';
const RELATION_TYPES = new Set([
  'subclassOf',
  'alternativeTo',
  'criticizes',
  'dependsOn',
  'supervenesOn',
  'emergesFrom',
  'implementedBy',
  'illustrates',
  'supports',
  'refutes',
  'formalizes',
  'generalizes',
  'develops',
  'contrastsWith',
  'independentFrom',
  'hasProblem',
  'hasConsequence'
]);

const RELATION_DEFINITIONS = [
  relation('metaphysics.dualism', 'alternativeTo', 'metaphysics.material-monism'),
  relation('metaphysics.dualism', 'alternativeTo', 'metaphysics.panpsychism'),
  relation('metaphysics.mind-body', 'dependsOn', 'metaphysics.dualism'),
  relation('metaphysics.qualia', 'dependsOn', 'metaphysics.mind-body'),
  relation('metaphysics.supervenience', 'dependsOn', 'metaphysics.material-monism'),
  relation('metaphysics.emergence', 'alternativeTo', 'metaphysics.reductionism'),
  relation('causality.counterfactuals', 'illustrates', 'ontology.possible-worlds'),
  relation('school.cartesianism', 'illustrates', 'metaphysics.dualism'),
  relation('school.merleau-ponty', 'criticizes', 'metaphysics.dualism'),
  relation('ontology.person-other', 'dependsOn', 'ontology.stances')
  , relation('mathematics.platonism', 'alternativeTo', 'mathematics.nominalism')
  , relation('mathematics.nominalism', 'develops', 'mathematics.fictionalism')
  , relation('mathematics.platonism', 'alternativeTo', 'mathematics.conceptualism')
  , relation('mathematics.psychologism', 'criticizes', 'mathematics.platonism')
  , relation('mathematics.logicism', 'hasProblem', 'mathematics.foundations-crisis')
  , relation('mathematics.formalism', 'hasConsequence', 'science.godel-incompleteness')
  , relation('mathematics.intuitionism', 'alternativeTo', 'mathematics.formalism')
  , relation('mathematics.intuitionism', 'criticizes', 'mathematics.logicism')
  , relation('mathematics.indispensability-argument', 'supports', 'mathematics.platonism')
  , relation('mathematics.set-theory', 'generalizes', 'mathematics.number')
  , relation('mathematics.zfc', 'subclassOf', 'mathematics.set-theory')
  , relation('mathematics.type-theory', 'alternativeTo', 'mathematics.set-theory')
  , relation('mathematics.category-theory', 'alternativeTo', 'mathematics.set-theory')
  , relation('mathematics.structuralism', 'develops', 'mathematics.category-theory')
  , relation('mathematics.ante-rem-structuralism', 'subclassOf', 'mathematics.structuralism')
  , relation('mathematics.in-re-structuralism', 'subclassOf', 'mathematics.structuralism')
  , relation('mathematics.post-rem-structuralism', 'subclassOf', 'mathematics.structuralism')
  , relation('mathematics.continuum-hypothesis', 'independentFrom', 'mathematics.zfc', { note: 'Indépendance relative aux axiomes de ZFC.' })
  , relation('mathematics.transfinite', 'dependsOn', 'mathematics.set-theory')
  , relation('mathematics.nonstandard-analysis', 'develops', 'mathematics.infinitesimal')
  , relation('mathematics.proof-theory', 'formalizes', 'mathematics.proof')
  , relation('mathematics.homotopy-type-theory', 'develops', 'mathematics.type-theory')
  , relation('mathematics.potential-actual-infinity', 'contrastsWith', 'mathematics.transfinite')
];

function relation(sourceId, relationType, targetId, metadata = {}) {
  return {
    apiVersion: 'genos.ontology/v1',
    kind: 'OntologyRelation',
    source: { kind: CONCEPT_KIND, id: sourceId },
    relationType,
    target: { kind: CONCEPT_KIND, id: targetId },
    metadata,
    provenance: { sourceType: 'genos' }
  };
}

function relationKey(item) {
  return `${item.source.kind}:${item.source.id}|${item.relationType}|${item.target.kind}:${item.target.id}`;
}

function normalizeRelation(item) {
  return {
    apiVersion: item.apiVersion || 'genos.ontology/v1',
    kind: item.kind || 'OntologyRelation',
    source: item.source,
    relationType: item.relationType,
    target: item.target,
    metadata: item.metadata || {},
    ...(item.confidence === undefined ? {} : { confidence: item.confidence }),
    provenance: item.provenance || { sourceType: 'genos' }
  };
}

function validateRelation(item, index, conceptIds) {
  const errors = [];
  const schemaResult = validateSpec(RELATION_SCHEMA, item);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors.map((error) => `relations[${index}]: ${error}`));
  }
  if (!RELATION_TYPES.has(item.relationType)) {
    errors.push(`relations[${index}].relationType is unsupported: ${item.relationType}`);
  }
  for (const endpoint of ['source', 'target']) {
    const node = item[endpoint];
    if (node?.kind === CONCEPT_KIND && !conceptIds.has(node.id)) {
      errors.push(`relations[${index}].${endpoint} references unknown concept '${node.id}'`);
    }
  }
  return errors;
}

function validateRelations(relations = RELATION_DEFINITIONS, concepts = CONCEPT_DEFINITIONS) {
  const normalized = relations.map(normalizeRelation);
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const errors = [];
  const keys = new Set();
  const duplicates = new Set();

  normalized.forEach((item, index) => {
    errors.push(...validateRelation(item, index, conceptIds));
    const key = relationKey(item);
    if (keys.has(key)) duplicates.add(key);
    keys.add(key);
  });

  if (duplicates.size) {
    errors.push(`duplicate relations: ${[...duplicates].sort().join(', ')}`);
  }
  return { valid: errors.length === 0, relations: normalized, errors };
}

function registryHealth() {
  const result = validateRelations();
  return {
    valid: result.valid,
    relationCount: result.relations.length,
    relationTypes: [...new Set(result.relations.map((item) => item.relationType))].sort(),
    errors: result.errors
  };
}

function listRelations(filters = {}) {
  return validateRelations().relations.filter((item) => {
    if (filters.relationType && item.relationType !== filters.relationType) return false;
    if (filters.sourceId && item.source.id !== filters.sourceId) return false;
    if (filters.targetId && item.target.id !== filters.targetId) return false;
    return true;
  });
}

module.exports = {
  RELATION_DEFINITIONS,
  RELATION_TYPES,
  normalizeRelation,
  validateRelations,
  registryHealth,
  listRelations
};
