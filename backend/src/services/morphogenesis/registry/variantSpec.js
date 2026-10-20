'use strict';

const { knownMaturity, proposalEligible } = require('./variantIdentity');

const SPEC_VERSION = 3;
const SPEC_KINDS = Object.freeze(['variant', 'profile', 'preset', 'alias']);
const QUALIFICATION_DIMENSIONS = Object.freeze([
  'catalogued', 'runtimeBinding', 'persistent', 'snapshotable', 'restorable',
  'endToEnd', 'empiricallyBeneficial'
]);
const QUALIFICATION_STATES = Object.freeze([
  'verified', 'declared', 'unknown', 'unsupported'
]);
const METAPOPULATION_PROFILES = new Set([
  'balanced', 'resilient', 'exploratory', 'conservative'
]);

function normalizeVariantSpec(input = {}) {
  validateInput(input);
  const maturity = input.maturity || 'implemented';
  return {
    specVersion: SPEC_VERSION,
    specKind: specKindFor(input),
    topology: input.topology,
    variantId: input.variantId,
    parameters: structuredClone(input.parameters || {}),
    policy: input.policy || null,
    description: input.description || null,
    maturity,
    qualification: qualificationFor(input, maturity),
    qualificationEvidence: qualificationEvidenceFor(input),
    requiredCapabilities: structuredClone(input.requiredCapabilities || []),
    source: input.source || null,
    aliasOf: input.aliasOf || null,
    maturityReasons: structuredClone(input.maturityReasons || []),
    maturityEvidence: structuredClone(input.maturityEvidence || null)
  };
}

function specKindFor(input) {
  if (input.aliasOf) return 'alias';
  if (input.specKind) return input.specKind;
  if (input.topology === 'trinity') return 'preset';
  if (input.topology === 'metapopulation' && METAPOPULATION_PROFILES.has(input.variantId)) {
    return 'profile';
  }
  return 'variant';
}

function qualificationFor(input, maturity) {
  const supplied = input.qualification || {};
  return {
    catalogued: supplied.catalogued || 'verified',
    runtimeBinding: supplied.runtimeBinding
      || (proposalEligible(maturity) ? 'declared' : 'unknown'),
    persistent: supplied.persistent || 'unknown',
    snapshotable: supplied.snapshotable || 'unknown',
    restorable: supplied.restorable || 'unknown',
    endToEnd: supplied.endToEnd || 'unknown',
    empiricallyBeneficial: supplied.empiricallyBeneficial || 'unknown'
  };
}

function qualificationEvidenceFor(input) {
  const supplied = input.qualificationEvidence || {};
  return Object.fromEntries(QUALIFICATION_DIMENSIONS.map((dimension) => [
    dimension, evidenceReferences(supplied[dimension])
  ]));
}

function evidenceReferences(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('VariantSpec qualification evidence must be an array');
  if (value.some((reference) => typeof reference !== 'string' || !reference.trim())) {
    throw new Error('VariantSpec qualification evidence must contain non-empty strings');
  }
  return [...new Set(value.map((reference) => reference.trim()))].sort();
}

function validateInput(input) {
  if (!input.topology) throw new Error('topology is required');
  if (!input.variantId) throw new Error('variantId is required');
  if (input.specKind && !SPEC_KINDS.includes(input.specKind)) {
    throw new Error(`Unknown VariantSpec kind: ${input.specKind}`);
  }
  if (input.maturity && !knownMaturity(input.maturity)) {
    throw new Error(`Unknown VariantSpec maturity: ${input.maturity}`);
  }
  validateQualification(input.qualification);
  validateQualificationEvidence(input.qualificationEvidence);
}

function validateQualification(qualification) {
  if (!qualification) return;
  for (const [dimension, state] of Object.entries(qualification)) {
    if (!QUALIFICATION_DIMENSIONS.includes(dimension)) {
      throw new Error(`Unknown VariantSpec qualification dimension: ${dimension}`);
    }
    if (!QUALIFICATION_STATES.includes(state)) {
      throw new Error(`Unknown VariantSpec qualification state: ${state}`);
    }
  }
}

function validateQualificationEvidence(evidence) {
  if (evidence === undefined) return;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('VariantSpec qualification evidence must be an object');
  }
  for (const dimension of Object.keys(evidence)) {
    if (!QUALIFICATION_DIMENSIONS.includes(dimension)) {
      throw new Error(`Unknown VariantSpec qualification evidence dimension: ${dimension}`);
    }
  }
}

module.exports = {
  QUALIFICATION_DIMENSIONS, QUALIFICATION_STATES, SPEC_KINDS, SPEC_VERSION,
  normalizeVariantSpec, specKindFor
};
