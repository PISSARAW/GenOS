'use strict';

const { CONCEPT_DEFINITIONS } = require('./conceptDefinitions');
const { validateSpec } = require('../services/specValidator');
const { GENOS_SUBDOMAINS, subdomainsForConcept } = require('./genosSubdomains');
const { maturityForConcept } = require('./serviceMaturity');
const { mappingForConcept } = require('./runtimeMappings');
const { DEFAULTS_BY_ROLE, ROLE_BY_ID } = require('./conceptRoles');

const CONCEPT_SCHEMA = 'philosophical-concept.schema.json';

function resolveRole(concept) {
  if (concept.role != null) return concept.role;
  return ROLE_BY_ID.get(concept.id) || null;
}

function resolveDefaults(role) {
  return role ? (DEFAULTS_BY_ROLE[role] || {}) : {};
}

function resolveKnownLimits(concept, defaults) {
  return concept.knownLimits && concept.knownLimits.length
    ? concept.knownLimits
    : (defaults.knownLimits || []);
}

function resolveField(conceptValue, defaultKey, defaults) {
  return conceptValue ?? defaults[defaultKey] ?? null;
}

function normalizeConcept(concept) {
  const resolvedRole = resolveRole(concept);
  const defaults = resolveDefaults(resolvedRole);
  const knownLimits = resolveKnownLimits(concept, defaults);
  const runtimeAuthority = resolveField(concept.runtimeAuthority, 'runtimeAuthority', defaults);
  const falsifiable = resolveField(concept.falsifiable, 'falsifiable', defaults);
  const scope = resolveField(concept.scope, 'scope', defaults);
  const historicalConfidence = resolveField(concept.historicalConfidence, 'historicalConfidence', defaults);

  return {
    apiVersion: 'genos.philosophy/v1',
    kind: 'PhilosophicalConcept',
    id: concept.id,
    label: concept.label,
    labels: concept.labels || {},
    family: concept.family || concept.domain,
    genosDomains: subdomainsForConcept(concept),
    aliases: concept.aliases || [],
    domain: concept.domain,
    school: concept.school,
    status: concept.status,
    service: concept.service || null,
    authors: concept.authors || [],
    works: concept.works || [],
    definition: concept.definition || '',
    examples: concept.examples || [],
    relations: concept.relations || [],
    claims: concept.claims || [],
    adapters: concept.adapters || [],
    evidenceLevel: concept.evidenceLevel || 'philosophical',
    mapping: concept.mapping || mappingForConcept(concept.id),
    serviceMaturity: maturityForConcept(concept),
    provenance: concept.provenance || {
      version: '1.0.0',      sourceType: 'genos',
      evidenceStatus: 'documented',
      interpretationStatus: 'conceptual',
    },
    role: resolvedRole,
    runtimeAuthority,
    falsifiable,
    scope,
    knownLimits,
    historicalConfidence,
  };
}

function duplicateIds(concepts) {
  const seen = new Set();
  const duplicates = new Set();
  for (const concept of concepts) {
    if (seen.has(concept.id)) duplicates.add(concept.id);
    seen.add(concept.id);
  }
  return [...duplicates].sort();
}

function validateScalarFields(concept, index) {
  const errors = [];
  for (const field of ['id', 'label', 'domain', 'school', 'status']) {
    if (typeof concept[field] !== 'string' || concept[field].trim() === '') {
      errors.push(`concepts[${index}].${field} must be a non-empty string`);
    }
  }
  if (typeof concept.id === 'string' && !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(concept.id)) {
    errors.push(`concepts[${index}].id must use lowercase dot/dash segments`);
  }
  if (concept.genosDomains.some((domain) => !GENOS_SUBDOMAINS.includes(domain))) {
    errors.push(`concepts[${index}].genosDomains contains an unknown GenOS subdomain`);
  }
  return errors;
}

function validateRegistry(concepts = CONCEPT_DEFINITIONS) {
  const normalized = concepts.map(normalizeConcept);
  const errors = [];
  normalized.forEach((concept, index) => {
    const result = validateSpec(CONCEPT_SCHEMA, concept);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => `concepts[${index}]: ${error}`));
    }
    errors.push(...validateScalarFields(concept, index));
  });

  const duplicates = duplicateIds(normalized);
  if (duplicates.length) errors.push(`duplicate concept ids: ${duplicates.join(', ')}`);

  const ids = new Set(normalized.map((concept) => concept.id));
  normalized.forEach((concept) => concept.relations.forEach((relation) => {
    if (!ids.has(relation.target)) {
      errors.push(`${concept.id}.relations references unknown concept '${relation.target}'`);
    }
  }));

  return { valid: errors.length === 0, concepts: normalized, errors };
}

function registryHealth() {
  const result = validateRegistry();
  return {
    valid: result.valid,
    conceptCount: result.concepts.length,
    duplicateIds: duplicateIds(result.concepts),
    errors: result.errors
  };
}

module.exports = { normalizeConcept, validateRegistry, registryHealth };
