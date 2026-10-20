'use strict';

const { knownMaturity, proposalEligible } = require('./variantIdentity');

const SPEC_VERSION = 2;
const SPEC_KINDS = Object.freeze(['variant', 'profile', 'preset', 'alias']);
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

function validateInput(input) {
  if (!input.topology) throw new Error('topology is required');
  if (!input.variantId) throw new Error('variantId is required');
  if (input.specKind && !SPEC_KINDS.includes(input.specKind)) {
    throw new Error(`Unknown VariantSpec kind: ${input.specKind}`);
  }
  if (input.maturity && !knownMaturity(input.maturity)) {
    throw new Error(`Unknown VariantSpec maturity: ${input.maturity}`);
  }
}

module.exports = { SPEC_KINDS, SPEC_VERSION, normalizeVariantSpec, specKindFor };
