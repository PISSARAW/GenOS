'use strict';

const catalog = require('../../../shared/indicatorRegistry.json');

function uniqueIds(entries) {
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate indicator registry ID');
  if (ids.some((id) => typeof id !== 'string' || !id)) throw new Error('Missing registry ID');
  return new Set(ids);
}

function validateRegistry(registry) {
  if (registry.schema !== 'genos.indicator-registry/v1') throw new Error('Unknown registry schema');
  const properties = uniqueIds(registry.properties);
  uniqueIds(registry.families);
  uniqueIds(registry.profiles);
  for (const family of registry.families) {
    if (family.propertyIds.some((id) => !properties.has(id))) throw new Error('Unknown property mapping');
  }
  return true;
}

function getRegistry() {
  validateRegistry(catalog);
  return structuredClone(catalog);
}

function pendingEntry(entry) {
  return {
    id: entry.id,
    label: entry.label,
    stages: Object.fromEntries(catalog.stages.map((stage) => [stage, 'not_run'])),
    evidenceRefs: [],
  };
}

function pendingEvaluation(profileId) {
  const registry = getRegistry();
  const profile = registry.profiles.find((entry) => entry.id === profileId);
  if (!profile) throw new Error('Unknown indicator profile');
  return {
    schema: 'genos.indicator-status/v1',
    registryVersion: registry.schema,
    profile,
    properties: registry.properties.map(pendingEntry),
    families: registry.families.map(pendingEntry),
    limitation: registry.limitation,
  };
}

module.exports = { getRegistry, validateRegistry, pendingEvaluation };
