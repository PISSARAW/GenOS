'use strict';

const catalog = require('../../../../shared/consciousnessExperimentRegistry.json');
const indicatorRegistry = require('../indicatorRegistryService');

const REGISTRY_SCHEMA = 'genos.consciousness-experiment-registry/v1';
const MANIFEST_SCHEMA = 'genos.consciousness-experiment-manifest/v1';

function reject(message) {
  const error = new TypeError(message);
  error.code = 'CONSCIOUSNESS_EXPERIMENT_INVALID';
  throw error;
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) reject(`${name} must be a non-empty string.`);
}

function uniqueIds(entries, name) {
  if (!Array.isArray(entries) || entries.length === 0) reject(`${name} must not be empty.`);
  const ids = entries.map((entry) => entry.id);
  if (ids.some((id) => typeof id !== 'string' || !id)) reject(`${name} contains a missing ID.`);
  if (new Set(ids).size !== ids.length) reject(`${name} contains a duplicate ID.`);
}

function requireKnownIds(ids, allowed, name) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) reject(`${name} must contain unique IDs.`);
  if (ids.some((id) => !allowed.has(id))) reject(`${name} contains an unknown registry reference.`);
}

function validateOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') reject('primaryOutcome is required.');
  requireText(outcome.metric, 'primaryOutcome.metric');
  requireText(outcome.measurement, 'primaryOutcome.measurement');
  if (!['increase', 'decrease'].includes(outcome.direction)) reject('primaryOutcome.direction is invalid.');
}

function validateHypothesis(hypothesis, references) {
  for (const field of ['statement', 'control', 'ablation', 'invalidationCondition']) {
    requireText(hypothesis[field], field);
  }
  requireKnownIds(hypothesis.indicatorIds, references.indicators, 'indicatorIds');
  requireKnownIds(hypothesis.familyIds, references.families, 'familyIds');
  if (hypothesis.familyIds.length === 0) reject('familyIds must not be empty.');
  if (!Array.isArray(hypothesis.limitations) || hypothesis.limitations.length === 0) {
    reject('limitations must not be empty.');
  }
  hypothesis.limitations.forEach((item) => requireText(item, 'limitation'));
  validateOutcome(hypothesis.primaryOutcome);
}

function registryReferences() {
  const registry = indicatorRegistry.getRegistry();
  return {
    indicators: new Set(registry.properties.map((entry) => entry.id)),
    families: new Set(registry.families.map((entry) => entry.id))
  };
}

function validateRegistry(registry) {
  if (!registry || registry.schema !== REGISTRY_SCHEMA) reject('Unknown experiment registry schema.');
  if (registry.indicatorRegistrySchema !== 'genos.indicator-registry/v1') reject('Indicator registry schema mismatch.');
  if (registry.claimVocabularySchema !== 'genos.consciousness-claim-vocabulary/v1') reject('Claim vocabulary schema mismatch.');
  if (registry.status !== 'research_only') reject('Registry must remain research_only.');
  if (registry.constraints?.phenomenalInferenceAllowed !== false || registry.constraints?.promotionAllowed !== false) {
    reject('Registry cannot authorize phenomenal inference or promotion.');
  }
  uniqueIds(registry.theories, 'theories');
  const hypotheses = registry.theories.flatMap((theory) => theory.hypotheses || []);
  uniqueIds(hypotheses, 'hypotheses');
  const references = registryReferences();
  hypotheses.forEach((hypothesis) => validateHypothesis(hypothesis, references));
  return true;
}

function getRegistry() {
  validateRegistry(catalog);
  return structuredClone(catalog);
}

function findHypothesis(hypothesisId) {
  requireText(hypothesisId, 'hypothesisId');
  for (const theory of catalog.theories) {
    const hypothesis = theory.hypotheses.find((entry) => entry.id === hypothesisId);
    if (hypothesis) return { theoryId: theory.id, hypothesis };
  }
  reject(`Unknown hypothesis '${hypothesisId}'.`);
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length === 0 || new Set(seeds).size !== seeds.length) {
    reject('seeds must be a non-empty unique array.');
  }
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0)) reject('seeds must be non-negative integers.');
}

function validateLocks(locks) {
  for (const field of ['model', 'toolset']) requireText(locks?.[field], `locks.${field}`);
  if (!Number.isFinite(locks?.budget) || locks.budget <= 0) reject('locks.budget must be positive.');
}

function validateThresholds(thresholds) {
  if (!Number.isFinite(thresholds?.minimumEffect) || thresholds.minimumEffect <= 0) reject('minimumEffect must be positive.');
  if (!Number.isFinite(thresholds?.confoundTolerance) || thresholds.confoundTolerance < 0) reject('confoundTolerance must be non-negative.');
}

function validateManifestInput(input) {
  requireText(input.profileId, 'profileId');
  requireText(input.revision, 'revision');
  validateSeeds(input.seeds);
  validateLocks(input.locks);
  validateThresholds(input.thresholds);
}

function createManifest(input = {}) {
  validateRegistry(catalog);
  validateManifestInput(input);
  const profile = indicatorRegistry.getRegistry().profiles.find((entry) => entry.id === input.profileId);
  if (!profile) reject(`Unknown profile '${input.profileId}'.`);
  if (profile.availability === 'planned') reject(`Profile '${input.profileId}' is not available.`);
  const selected = findHypothesis(input.hypothesisId);
  return {
    schema: MANIFEST_SCHEMA,
    registryVersion: REGISTRY_SCHEMA,
    theoryId: selected.theoryId,
    hypothesisId: selected.hypothesis.id,
    profileId: input.profileId,
    revision: input.revision,
    seeds: [...input.seeds],
    locks: structuredClone(input.locks),
    thresholds: structuredClone(input.thresholds),
    protocol: structuredClone(selected.hypothesis),
    status: 'specified',
    claimBoundary: {
      phenomenalExperience: 'unassessed',
      phenomenalInferenceAllowed: false,
      promotionAllowed: false
    }
  };
}

module.exports = { getRegistry, validateRegistry, findHypothesis, createManifest };
