'use strict';

const PROFILE_DIMENSIONS = Object.freeze([
  'epistemicUncertainty', 'hypothesisSeparability', 'experimentalDecidability',
  'functionalDecomposability', 'stateCoupling', 'staleReadCost', 'authorityAsymmetry',
  'deliberativeNeed', 'dissentImportance', 'structureUnknownness', 'ecologicalComplexity',
  'resourceCompetition', 'localAutonomy', 'persistenceNeed', 'failureCorrelation',
  'capabilityUncertainty', 'adversarialRisk', 'privacySeparation', 'temporalHorizon'
]);

function normalizeDimension(input, observedAt) {
  if (typeof input === 'number') return legacyDimension(input, observedAt);
  if (input === undefined || input === null) return unknownDimension();
  return objectDimension(input, observedAt);
}

function legacyDimension(value, observedAt) {
  return { value, confidence: 0, evidenceRefs: [], observedAt: observedAt || null };
}

function unknownDimension() {
  return { value: null, confidence: 0, evidenceRefs: [], observedAt: null };
}

function objectDimension(input, observedAt) {
  const source = typeof input === 'object' ? input : {};
  return {
    value: typeof source.value === 'number' ? source.value : null,
    confidence: typeof source.confidence === 'number' ? source.confidence : 0,
    evidenceRefs: Array.isArray(source.evidenceRefs) ? [...source.evidenceRefs] : [],
    observedAt: source.observedAt || (typeof source.value === 'number' ? observedAt || null : null)
  };
}

function createProblemMorphologyProfile(input = {}, options = {}) {
  const observedAt = options.observedAt || new Date().toISOString();
  const dimensions = {};
  for (const name of PROFILE_DIMENSIONS) dimensions[name] = normalizeDimension(input[name], observedAt);
  return {
    profileVersion: 2,
    scopeId: options.scopeId || null,
    dimensions,
    observedAt,
    source: options.source || 'unspecified'
  };
}

function validateProblemMorphologyProfile(profile) {
  const errors = [];
  const dimensions = profile && profile.dimensions ? profile.dimensions : {};
  for (const name of PROFILE_DIMENSIONS) {
    const item = dimensions[name];
    if (!item) {
      errors.push(`missing dimension: ${name}`);
      continue;
    }
    errors.push(...dimensionErrors(name, item));
  }
  return { valid: errors.length === 0, errors };
}

function dimensionErrors(name, item) {
  const errors = [];
  if (item.value !== null && (!Number.isFinite(item.value) || item.value < 0 || item.value > 1)) errors.push(`invalid value: ${name}`);
  if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) errors.push(`invalid confidence: ${name}`);
  if (!Array.isArray(item.evidenceRefs)) errors.push(`invalid evidenceRefs: ${name}`);
  return errors;
}

module.exports = { PROFILE_DIMENSIONS, createProblemMorphologyProfile, validateProblemMorphologyProfile };
