'use strict';

const { CONCEPT_DEFINITIONS } = require('./conceptDefinitions');
const { validateSpec } = require('../services/specValidator');

const RELATION_SCHEMA = 'ontology-relation.schema.json';
const CONCEPT_KIND = 'PhilosophicalConcept';
const RELATION_TYPES = new Set([
  // Taxonomie / structure
  'subclassOf',
  'alternativeTo',
  'criticizes',
  'dependsOn',
  'supervenesOn',
  'emergesFrom',
  'illustrates',
  // Logique / épistémique
  'supports',
  'refutes',
  'formalizes',
  'generalizes',
  'develops',
  'contrastsWith',
  'independentFrom',
  'hasProblem',
  'hasConsequence',
  // Nouveaux types pour le modèle opérationnel
  'operationalizes',
  'analogizesTo',
  'inspiredBy',
  'assumes',
  'conflictsWith',
  'underdetermines',
  'notEquivalentTo',
  'caveat',
]);

// Build a set of valid concept IDs to avoid dangling references
const VALID_IDS = new Set(CONCEPT_DEFINITIONS.map((c) => c.id));

const RELATION_DEFINITIONS = [
  // ─── Core commitments → operationalizations ──────────────────────────────
  relation('core.success-not-truth', 'operationalizes', 'epistemology.falsification'),
  relation('core.success-not-truth', 'underdetermines', 'epistemology.evidence-algebra'),
  relation('core.claim-not-evidence', 'operationalizes', 'epistemology.evidence-algebra'),
  relation('core.intervention-not-metaphor', 'operationalizes', 'method.intervention-replay'),
  relation('core.biomimetic-experimental', 'assumes', 'biomimetic.chemotaxis'),

  // ─── Biomimetic analogies → processes ────────────────────────────────────
  relation('biomimetic.chemotaxis', 'analogizesTo', 'process.actuality-potentiality'),
  relation('biomimetic.affinity-maturation', 'analogizesTo', 'process.actuality-potentiality'),
  relation('biomimetic.stress-mutagenesis', 'analogizesTo', 'process.actuality-potentiality'),
  relation('biomimetic.phenotypic-plasticity', 'analogizesTo', 'process.actuality-potentiality'),
  relation('biomimetic.cultural-transmission', 'analogizesTo', 'process.actuality-potentiality'),
  relation('biomimetic.exaptation', 'analogizesTo', 'process.actuality-potentiality'),

  // ─── Interpretive lenses → caveats (leurs limites explicites) ────────────
  relation('lens.stoicism', 'caveat', { id: 'lens.stoicism', metadata: { note: 'isMonist() was hardcoded — that was a bug' } }),
  relation('lens.epicureanism', 'caveat', { id: 'lens.epicureanism', metadata: { note: 'atomSchema created 3 atom types — misrepresents Epicurus' } }),
  relation('lens.whitehead', 'caveat', { id: 'lens.whitehead', metadata: { note: 'Actual occasions are philosophical primitives, not telemetry events' } }),
  relation('lens.deleuze', 'caveat', { id: 'lens.deleuze', metadata: { note: 'Rhizome topology is metaphor, not computational constraint' } }),
  relation('lens.utilitarianism', 'caveat', { id: 'lens.utilitarianism', metadata: { note: 'utility>0 → permissible is incomplete without alternatives/horizon/distribution' } }),
  relation('lens.virtue-ethics', 'caveat', { id: 'lens.virtue-ethics', metadata: { note: 'mean(wisdom,courage,temperance,justice) → arbitrary score' } }),

  // ─── Épistémologie et vérité ─────────────────────────────────────────────
  relation('epistemology.falsification', 'criticizes', 'epistemology.revisability'),
  relation('epistemology.revisability', 'supports', 'core.success-not-truth'),
  relation('epistemology.evidence-algebra', 'notEquivalentTo', 'epistemology.revisability'),
  relation('epistemology.truth', 'underdetermines', 'science.progress'),

  // ─── Legacy ontology ────────────────────────────────────────────────────
  relation('metaphysics.supervenience', 'dependsOn', 'ontology.identity-change'),
  relation('ontology.identity-change', 'dependsOn', 'metaphysics.emergence'),

  // ─── Mathématiques : indépendances et fondements ─────────────────────────
  relation('mathematics.continuum-hypothesis', 'independentFrom', 'mathematics.zfc'),
];

function relation(sourceId, relationType, target) {
  const targetId = typeof target === 'string' ? target : target.id;
  const metadata = typeof target === 'string' ? {} : target.metadata || {};
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

  // Filter out relations that reference concepts not in the registry
  const validRelations = normalized.filter((item) => {
    const sourceExists = conceptIds.has(item.source.id);
    const targetExists = conceptIds.has(item.target.id);
    if (!sourceExists || !targetExists) {
      return false;
    }
    return true;
  });

  validRelations.forEach((item, index) => {
    const validationErrors = validateRelation(item, index, conceptIds);
    errors.push(...validationErrors);
    const key = relationKey(item);
    if (keys.has(key)) duplicates.add(key);
    keys.add(key);
  });

  if (duplicates.size) {
    errors.push(`duplicate relations: ${[...duplicates].sort().join(', ')}`);
  }
  return { valid: errors.length === 0, relations: validRelations, errors };
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
