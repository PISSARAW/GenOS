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
  const profile = requestedProfile(ctx, topology);
  if (profile && !profileMatchesTopology(profile, topology)) return null;
  const selected = profile || automaticProfile(ctx, topology, registry);
  if (!selected) return null;
  const result = resolveTopologyProfile(selected, registry);
  if (!result.valid) throw new Error(`Invalid topology profile: ${result.errors.join('; ')}`);
  result.variantSelection = selected.variantSelection || profileSelection(profile, result);
  return result;
}

function profileMatchesTopology(profile, topology) {
  return profile.baseTopology === topology;
}

function profileSelection(profile, result) {
  const selectedExplicitly = Boolean(profile);
  return {
    variantId: result.selectedVariant?.variantId || 'default',
    method: selectedExplicitly ? 'explicit_profile' : 'safe_baseline',
    confidence: selectedExplicitly ? 1 : 0.5,
    reasons: selectedExplicitly ? ['EXPLICIT_TOPOLOGY_PROFILE'] : ['NO_EXECUTABLE_SPECIALIZATION']
  };
}

function requestedProfile(ctx, topology) {
  if (ctx.topologyProfile) return ctx.topologyProfile;
  return ctx.variantId ? legacyVariantProfile(topology, ctx.variantId) : null;
}

function automaticProfile(ctx, topology, registry) {
  if (ctx.disableVariantAutoselection === true) return null;
  const selection = selectLocalVariant(topology, ctx);
  const canonicalId = catalogId(topology, selection.variantId, registry);
  const catalogEntry = registry.resolve(topology, canonicalId);
  const usable = catalogEntry && catalogEntry.maturity === 'implemented';
  const variantId = usable ? canonicalId : 'default';
  return {
    baseTopology: topology,
    structuralVariants: variantId === 'default' ? [] : [variantId],
    variantSelection: usable ? selection : {
      variantId, method: 'safe_baseline', confidence: selection.confidence || 0.5,
      reasons: [...(selection.reasons || []), 'SELECTED_VARIANT_NOT_FULLY_IMPLEMENTED']
    }
  };
}

function catalogId(topology, requested, registry) {
  const normalized = normalizeVariantId(requested);
  return registry.list(topology).find((variantId) => normalizeVariantId(variantId) === normalized) || requested;
}

function normalizeVariantId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function selectLocalVariant(topology, ctx) {
  const mission = missionText(ctx);
  const selector = LOCAL_SELECTORS[topology];
  if (!selector) return defaultSelection('NO_VARIANT_SELECTOR');
  try {
    return selector(ctx, mission);
  } catch (error) {
    return defaultSelection(error.code || 'SELECTOR_UNAVAILABLE');
  }
}

const LOCAL_SELECTORS = Object.freeze({
  a_team: (ctx, mission) => aTeamSelection(ctx, mission),
  biocenose: (ctx, mission) => biocenoseSelection(ctx, mission),
  syncytium: (_ctx, mission) => syncytiumSelection(mission),
  rhizome: (ctx, mission) => rhizomeSelection(ctx, mission),
  metapopulation: (ctx, mission) => metapopulationSelection(ctx, mission),
  biome: (ctx, mission) => biomeSelection(ctx, mission),
  holobionte: (ctx, mission) => holobionteSelection(ctx, mission)
});

function defaultSelection(reason) {
  return { variantId: 'default', method: 'safe_baseline', confidence: 0.5, reasons: [reason] };
}

function missionText(ctx) {
  const mission = ctx.mission || ctx.problem || {};
  return [ctx.prompt, ctx.goal, ctx.currentTask, mission.prompt, mission.goal, mission.description]
    .filter((value) => typeof value === 'string').join('\n');
}

function aTeamSelection(ctx, mission) {
  const selected = require('../../aTeam/variants/variantRegistry').buildVariantPlan({
    ...ctx.problemProfile, goal: mission, mission
  });
  return { variantId: selected.variant, method: selected.evidence.explicit ? 'explicit' : 'mission_signals',
    confidence: selected.evidence.explicit ? 1 : 0.75, reasons: selected.evidence.signals };
}

function biocenoseSelection(ctx, mission) {
  const selection = require('../../biocenose/variants/variantPolicyRouter').recommend(mission, ctx.questionType).selection;
  return { ...selection, variantId: selection.variant };
}

function syncytiumSelection(mission) {
  const policy = require('../../syncytium/variants/variantPolicyRegistry').selectPolicy(mission);
  const fit = policy.analyzeFit(mission, {});
  return { variantId: policy.id, method: fit.recommended ? 'mission_signals' : 'safe_baseline',
    confidence: fit.score, reasons: fit.matchedSignals };
}

function rhizomeSelection(ctx, mission) {
  const selected = require('../../rhizome/variants/variantPolicyService').selectForMission(mission, { scope: ctx.scope });
  return { variantId: selected.name, ...selected.selection };
}

function metapopulationSelection(ctx, mission) {
  const selected = require('../../metapopulation/policy/metapopulationPolicyService')
    .resolveMetapopulationVariant({ mission, scope: ctx.scope });
  return { variantId: selected.variant, ...selected.selection };
}

function biomeSelection(ctx, mission) {
  const selection = require('../../biome/variants/variantPolicyService').select(mission, { scope: ctx.scope }).selection;
  return { ...selection, variantId: selection.variant };
}

function holobionteSelection(ctx, mission) {
  const selected = require('../../holobionte/variants').selectForMission(mission, ctx.problemProfile || {});
  return { variantId: selected.policy.name, method: selected.receipt.source,
    confidence: selected.receipt.fitScore, reasons: [selected.receipt.reason] };
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
  plan.variantSelection = result.variantSelection;
}

module.exports = {
  PROFILE_DIMENSIONS, normalizeProfile, resolveTopologyProfile, legacyVariantProfile,
  resolveRequestedProfile, profileForGraph, applyProfileToPlan
};
