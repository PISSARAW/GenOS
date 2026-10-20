'use strict';

const policy = require('./metapopulationPolicyService');
const runtime = require('./variantRuntimeService');
const regional = require('../runtime/regionalPolicyService');

const EXPECTED_ACTIONS = Object.freeze({
  balanced: ['MIGRATE_PROPAGULE'],
  resilient: ['MIGRATE_PROPAGULE'],
  exploratory: ['MIGRATE_PROPAGULE'],
  conservative: ['MIGRATE_PROPAGULE'],
  classic_patch: ['VACATE_COLLAPSED_PATCH', 'START_RECOLONIZATION_TRIAL'],
  island_search: ['SEARCH_ISLAND', 'TRIGGER_ISLAND_MIGRATION', 'MIGRATE_PROPAGULE'],
  heterogeneous_islands: ['TRANSFER_CULTURE', 'MIGRATE_PROPAGULE'],
  source_sink: ['ROTATE_SOURCE_SINK_ROLES', 'PROTECT_SOURCE'],
  rescue_network: ['RECOVERY_SLA_BREACH', 'ACTIVATE_RESERVE_CORRIDOR', 'DEPLOY_FOUNDER', 'STAGE_FOUNDER_RESERVE'],
  stepping_stone: ['TRIGGER_STEPPING_STONE_MIGRATION', 'HANDLE_BRIDGE_EXTINCTION'],
  anti_synchrony: ['REGULATE_CORRIDORS', 'RECOVER_FIREBREAKS', 'DIVERSITY_FLOOR_BREACH', 'ALLOW_CONTROLLED_EXTINCTION'],
  federated: ['REJECT_FEDERATED_TRANSFER', 'PROOF_OF_DATA_MINIMIZATION', 'REQUIRE_RECEIVER_ATTESTATION'],
  ephemeral_patch: ['DISCOVER_EPHEMERAL_PATCH', 'EXPIRE_EPHEMERAL_PATCH', 'REBIND_EPHEMERAL_PATCH', 'DORMANT_EPHEMERAL_DEME', 'ACTIVATE_EPHEMERAL_DEME'],
  persistent: ['REGISTER_RESIDENT_DAEMON', 'MAINTAIN_RESIDENT_DAEMON_CYCLE', 'DECAY_DEME_MEMORY', 'INTER_MISSION_MIGRATION'],
  evolutionary: ['EVOLVE_ISLAND', 'CHECK_SPECIATION'],
  cultural: ['TRANSFER_CULTURE', 'MUTATE_CULTURE', 'BUILD_CULTURAL_PHYLOGENY']
});

const brain = require('../runtime/regionalBrainService');

function handledActionTypes() {
  return new Set([...policy.resolveVariantRuntime('balanced').handledActionTypes(),
    ...Object.keys(regional.EVENT_ACTIONS), ...Object.keys(brain.CORE_ACTION_EXECUTORS)]);
}

function variantExpectations(variant) {
  return EXPECTED_ACTIONS[variant] || [];
}

function missingHandlers(variant, handled) {
  return variantExpectations(variant).filter((type) => !handled.has(type));
}

function variantChecks(variant) {
  const handled = handledActionTypes();
  const missing = missingHandlers(variant, handled);
  return {
    variant,
    policy: Boolean(policy.VARIANTS[variant]),
    planner: hasPlanner(variant),
    expectedActions: variantExpectations(variant),
    missingHandlers: missing
  };
}

function hasPlanner(variant) {
  return typeof runtime.VARIANT_PLANNERS[variant] === 'function';
}

function maturityForVariant(variant) {
  const checks = variantChecks(variant);
  const ready = checks.policy && checks.planner && checks.missingHandlers.length === 0;
  return ready ? 'implemented' : 'partial';
}

function describeVariantProof(variant) {
  const checks = variantChecks(variant);
  return { ...checks, maturity: maturityForVariant(variant) };
}

function listVariantMaturities() {
  return Object.fromEntries(Object.keys(policy.VARIANTS).map((variant) => [variant, maturityForVariant(variant)]));
}

module.exports = { EXPECTED_ACTIONS, variantExpectations, variantChecks, maturityForVariant, describeVariantProof, listVariantMaturities };
