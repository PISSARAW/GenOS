'use strict';

const PROFILE_DIMENSIONS = Object.freeze([
  'structuralVariants', 'behavioralPolicies', 'resourcePolicies',
  'communicationPolicies', 'authorityPolicies', 'evidencePolicies',
  'persistencePolicies', 'resiliencePolicies', 'temporalPolicies',
  'explorationPolicies', 'executionAdapters'
]);

function normalizeProfile(input = {}) {
  const profile = { version: 1, baseTopology: input.baseTopology, ...input };
  for (const dimension of PROFILE_DIMENSIONS) {
    const value = profile[dimension];
    if (value === undefined) profile[dimension] = [];
    else if (!Array.isArray(value)) throw new Error(`${dimension} must be an array`);
  }
  if (!profile.baseTopology) throw new Error('baseTopology is required');
  return profile;
}

function resolveTopologyProfile(input, variantRegistry) {
  const profile = normalizeProfile(input);
  const resolved = {};
  const errors = [];
  const effectiveParameters = {};
  validateBaseTopology(profile, variantRegistry, errors);
  for (const dimension of PROFILE_DIMENSIONS) resolved[dimension] = resolveDimension({
    profile, dimension, variantRegistry, effectiveParameters, errors
  });
  const structural = resolved.structuralVariants;
  addStructuralErrors(structural, errors);
  return {
    valid: errors.length === 0,
    errors,
    profile,
    selectedVariant: structural[0] ? structural[0].variant : null,
    resolved,
    effectiveParameters
  };
}

function validateBaseTopology(profile, registry, errors) {
  if (!registry.list(profile.baseTopology).includes('default')) {
    errors.push(`unknown base topology: ${profile.baseTopology}`);
  }
}

function resolveDimension(input) {
  return input.profile[input.dimension].map((item, index) => resolveReference({
    ...input, reference: typeof item === 'string' ? { variantId: item } : item, index
  })).filter(Boolean);
}

function resolveReference(input) {
  const { profile, dimension, variantRegistry, effectiveParameters, errors, reference, index } = input;
  if (!reference || typeof reference.variantId !== 'string') {
    errors.push(`${dimension}[${index}] requires a variantId`);
    return null;
  }
  const variant = variantRegistry.resolve(profile.baseTopology, reference.variantId);
  if (!variant) errors.push(`unknown ${profile.baseTopology} variant: ${reference.variantId}`);
  if (variant && variant.maturity !== 'implemented' && reference.allowPartial !== true) {
    errors.push(`${reference.variantId} is ${variant.maturity}; allowPartial must be explicit`);
  }
  if (!variant || !isMature(variant, reference)) return null;
  mergeParameters(variant, effectiveParameters, errors);
  return { ...reference, variant };
}

function isMature(variant, reference) {
  return variant.maturity === 'implemented' || reference.allowPartial === true;
}

function mergeParameters(variant, parameters, errors) {
  for (const [key, value] of Object.entries(variant.parameters)) {
    if (Object.hasOwn(parameters, key) && JSON.stringify(parameters[key]) !== JSON.stringify(value)) {
      errors.push(`conflicting parameter ${key} across selected profile components`);
    }
    parameters[key] = value;
  }
}

function addStructuralErrors(structural, errors) {
  if (structural.length > 1) errors.push('at most one structuralVariant may be selected');
}

function legacyVariantProfile(topology, variantId) {
  return normalizeProfile({
    baseTopology: topology,
    structuralVariants: variantId && variantId !== 'default' ? [variantId] : []
  });
}

function resolveRequestedProfile(ctx, topology, registry) {
  const profile = ctx.topologyProfile || (ctx.variantId ? legacyVariantProfile(topology, ctx.variantId) : null);
  if (!profile || profile.baseTopology !== topology) return null;
  const result = resolveTopologyProfile(profile, registry);
  if (!result.valid) throw new Error(`Invalid topology profile: ${result.errors.join('; ')}`);
  return result;
}

function profileForGraph(result) {
  if (!result) return null;
  return {
    ...result.profile,
    selectedVariant: result.selectedVariant?.variantId || 'default',
    effectiveParameters: result.effectiveParameters
  };
}

function applyProfileToPlan(plan, result) {
  if (!result) return;
  plan.topologyProfile = result.profile;
  plan.selectedVariant = result.selectedVariant?.variantId || 'default';
  plan.variantParameters = result.effectiveParameters;
}

module.exports = {
  PROFILE_DIMENSIONS, normalizeProfile, resolveTopologyProfile, legacyVariantProfile,
  resolveRequestedProfile, profileForGraph, applyProfileToPlan
};
