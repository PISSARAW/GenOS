'use strict';

const affinity = require('./epistemic/affinityMaturationService');
const { hash } = require('./gvxContracts');

const ACTIONABLE_DIAGNOSES = new Set(['false_positive', 'false_negative', 'incomplete']);
const MAX_CANDIDATES = 4;
const MAX_VALUE_BYTES = 512;

function verificationFor(attribution) {
  const diagnosis = attribution.diagnosis;
  return { strategy: attribution.locus.verificationStrategy || ['inspecter trace', 'chercher contre-exemple'],
    falsePositive: diagnosis === 'false_positive', falseNegative: diagnosis === 'false_negative',
    complete: diagnosis !== 'incomplete' };
}

function policyError(locus) {
  const policy = locus?.mutationPolicy;
  const errors = [policyShapeError(locus, policy), editBudgetError(policy), candidateBudgetError(policy),
    valueBudgetError(policy), recipeError(policy)];
  return errors.find(Boolean) || null;
}

function policyShapeError(locus, policy) {
  if (!locus?.field || !policy) return 'locus-mutation-policy-required';
  return Array.isArray(policy.allowedValues) ? null : 'locus-mutation-policy-required';
}

function editBudgetError(policy) {
  if (policy?.maxEdits !== 1) return 'single-edit-policy-required';
  return null;
}

function candidateBudgetError(policy) {
  return Number.isInteger(policy?.maxCandidates) && policy.maxCandidates >= 1
    && policy.maxCandidates <= MAX_CANDIDATES ? null : 'locus-candidate-budget-invalid';
}

function valueBudgetError(policy) {
  return Number.isInteger(policy?.maxSerializedBytes) && policy.maxSerializedBytes >= 1
    && policy.maxSerializedBytes <= MAX_VALUE_BYTES ? null : 'locus-value-budget-invalid';
}

function recipeError(policy) {
  return policy?.recipes && typeof policy.recipes === 'object'
    ? null : 'locus-mutation-recipes-required';
}

function scalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function admissibleRecipe(recipe, locus) {
  const policy = locus.mutationPolicy;
  if (!recipe || !scalar(recipe.value) || recipe.value === locus.currentValue) return false;
  if (!policy.allowedValues.some((value) => Object.is(value, recipe.value))) return false;
  return Buffer.byteLength(JSON.stringify(recipe.value)) <= policy.maxSerializedBytes;
}

function mutationEnvelope(attribution, maturity, recipe) {
  const locus = attribution.locus;
  const patch = { operation: 'replace', locusId: locus.locusId, componentRef: locus.componentRef,
    field: locus.field, expectedValueHash: hash(locus.currentValue), value: recipe.value };
  const basis = { traceId: attribution.receipt.businessDecision?.traceId
      || attribution.receipt.signedReceipt?.businessDecision?.traceId,
    hypothesisId: attribution.hypothesisId, diagnosis: attribution.diagnosis,
    aeisMutation: maturity.mutation, patch };
  return { candidateId: `affinity-${hash(basis)}`, candidateHash: hash(basis), ...basis,
    expectedEffect: recipe.expectedEffect || null, edits: [patch], editCount: 1,
    sourceEventRefs: [...attribution.eventRefs], attributionReceipt: attribution.receipt,
    promotionAllowed: false };
}

function planAttribution(attribution) {
  if (!ACTIONABLE_DIAGNOSES.has(attribution.diagnosis)) {
    return { candidates: [], reason: 'diagnosis-not-actionable' };
  }
  const error = policyError(attribution.locus);
  if (error) return { candidates: [], reason: error };
  const maturity = affinity.matureStrategy(verificationFor(attribution), { verified: true });
  const recipes = attribution.locus.mutationPolicy.recipes[maturity.mutation];
  if (!Array.isArray(recipes) || !recipes.length) return { candidates: [], reason: 'targeted-recipe-unavailable' };
  const candidates = recipes.filter((recipe) => admissibleRecipe(recipe, attribution.locus))
    .slice(0, attribution.locus.mutationPolicy.maxCandidates)
    .map((recipe) => mutationEnvelope(attribution, maturity, recipe));
  return candidates.length ? { candidates, reason: null } : { candidates: [], reason: 'targeted-recipes-rejected' };
}

function plan(report, options = {}) {
  const requested = options.maxCandidates || MAX_CANDIDATES;
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_CANDIDATES) {
    throw Object.assign(new Error('bounded candidate count required'), { code: 'GVX_MUTATION_BUDGET_INVALID' });
  }
  const candidates = [];
  const rejected = [...(report.rejected || [])];
  for (const attribution of report.accepted || []) {
    const outcome = planAttribution(attribution);
    candidates.push(...outcome.candidates);
    if (outcome.reason) rejected.push({ hypothesisId: attribution.hypothesisId,
      locusId: attribution.locus?.locusId, status: 'rejected', reason: outcome.reason });
    if (candidates.length >= requested) break;
  }
  return { traceId: report.traceId, candidates: candidates.slice(0, requested), rejected,
    maxCandidates: requested, promotionAllowed: false };
}

module.exports = { ACTIONABLE_DIAGNOSES, MAX_CANDIDATES, MAX_VALUE_BYTES, policyError,
  admissibleRecipe, mutationEnvelope, planAttribution, plan };
