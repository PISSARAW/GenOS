'use strict';

const VARIANT_FIELDS = Object.freeze([
  'variantId', 'parameters', 'applicability', 'invariants',
  'strengths', 'failureModes', 'costModifiers', 'compatibleOperators',
  'transitionRules', 'maturity', 'evidence'
]);

const MATURITY_LEVELS = Object.freeze(['experimental', 'beta', 'stable', 'deprecated']);

function createVariant(input = {}) {
  const variant = buildVariantObject(input);
  const validation = validateVariant(variant);
  if (!validation.valid) throw new Error(`Invalid variant: ${validation.errors.join('; ')}`);
  return variant;
}

function buildVariantObject(input) {
  const base = { variantId: input.variantId, maturity: input.maturity || 'experimental' };
  return Object.assign(base, baseObj(input), arrayFields(input));
}

function baseObj(input) {
  return {
    parameters: input.parameters || {},
    costModifiers: input.costModifiers || {},
    applicability: input.applicability || [],
    invariants: input.invariants || [],
    strengths: input.strengths || [],
    failureModes: input.failureModes || [],
    compatibleOperators: input.compatibleOperators || [],
    transitionRules: input.transitionRules || [],
    evidence: input.evidence || []
  };
}

function validateVariant(variant) {
  const errors = [];
  reqStr(variant, 'variantId', errors);
  optObj(variant, 'parameters', errors);
  optArr(variant, 'applicability', errors);
  optArr(variant, 'invariants', errors);
  optArr(variant, 'strengths', errors);
  optArr(variant, 'failureModes', errors);
  optObj(variant, 'costModifiers', errors);
  optArr(variant, 'compatibleOperators', errors);
  optArr(variant, 'transitionRules', errors);
  checkMaturity(variant, errors);
  optArr(variant, 'evidence', errors);
  return { valid: errors.length === 0, errors };
}

function reqStr(o, f, e) { if (!o[f] || typeof o[f] !== 'string') e.push(`${f} is required and must be a string`); }
function optObj(o, f, e) { if (o[f] && typeof o[f] !== 'object') e.push(`${f} must be an object`); }
function optArr(o, f, e) { if (o[f] && !Array.isArray(o[f])) e.push(`${f} must be an array`); }
function checkMaturity(v, e) { if (v.maturity && !['experimental', 'beta', 'stable', 'deprecated'].includes(v.maturity)) e.push('maturity must be one of: experimental, beta, stable, deprecated'); }

function createTransitionRule(opts = {}) {
  return { fromVariant: opts.fromVariant, toVariant: opts.toVariant, condition: opts.condition, cost: opts.cost || 0, lossEstimate: opts.lossEstimate || 0, requiresEvidence: opts.requiresEvidence || [], autoRevert: opts.autoRevert || false };
}

module.exports = { VARIANT_FIELDS, MATURITY_LEVELS, createVariant, validateVariant, createTransitionRule };