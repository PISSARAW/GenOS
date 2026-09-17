'use strict';

const { CONCEPT_DEFINITIONS } = require('./conceptDefinitions');

const VALID_STATUSES = Object.freeze(['implemented', 'partial', 'planned']);
const registry = new Map(CONCEPT_DEFINITIONS.map((concept) => [concept.id, Object.freeze({ ...concept })]));

function cloneConcept(concept) {
  return concept ? { ...concept } : null;
}

function listConcepts(filters = {}) {
  return [...registry.values()]
    .filter((concept) => !filters.domain || concept.domain === filters.domain)
    .filter((concept) => !filters.school || concept.school === filters.school)
    .filter((concept) => !filters.status || concept.status === filters.status)
    .map(cloneConcept);
}

function getConcept(id) {
  return cloneConcept(registry.get(String(id || '').trim()));
}

function listDomains() {
  return [...new Set([...registry.values()].map((concept) => concept.domain))].sort();
}

function listSchools() {
  return [...new Set([...registry.values()].map((concept) => concept.school))].sort();
}

function registryHealth() {
  const duplicateIds = CONCEPT_DEFINITIONS
    .map((concept) => concept.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  const invalidStatuses = CONCEPT_DEFINITIONS
    .filter((concept) => !VALID_STATUSES.includes(concept.status))
    .map((concept) => concept.id);
  return {
    valid: duplicateIds.length === 0 && invalidStatuses.length === 0,
    conceptCount: registry.size,
    duplicateIds,
    invalidStatuses,
    domains: listDomains(),
    schools: listSchools(),
    statusCounts: VALID_STATUSES.reduce((counts, status) => ({
      ...counts,
      [status]: listConcepts({ status }).length,
    }), {}),
  };
}

module.exports = {
  CONCEPT_DEFINITIONS,
  VALID_STATUSES,
  listConcepts,
  getConcept,
  listDomains,
  listSchools,
  registryHealth,
};
