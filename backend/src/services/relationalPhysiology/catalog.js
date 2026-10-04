'use strict';

// Roles describe runtime identity, never permissions granted by a social label.
const ROLES = Object.freeze([
  'human', 'ontogenesis', 'orchestrator', 'sub_orchestrator', 'worker',
  'bounded_worker', 'adaptive_worker', 'specialist', 'verifier_worker',
  'reviewer_worker', 'liaison_worker', 'symbiotic_worker', 'resident_daemon',
  'scout_cell', 'sentinel_keeper'
]);
const LINEAGE = Object.freeze([
  'parent', 'child', 'sibling', 'twin', 'ancestor', 'descendant', 'chimera', 'plasmid', 'graft'
]);
const TYPES = Object.freeze([...LINEAGE,
  'manager', 'subordinate', 'colleague', 'coworker', 'collaborator', 'mentor',
  'stranger', 'friend', 'partner', 'bonded_partner', 'neighbor', 'rival', 'temporary_ally',
  'client', 'supplier', 'guardian', 'dependent', 'verifier', 'reviewer', 'adversary'
]);
const BLIND_TYPES = Object.freeze(['adversary', 'rival', 'verifier']);
const CONTROL_EVENTS = Object.freeze(['stop', 'pause', 'revoke', 'lease_expired', 'failure', 'blocked']);
const DELEGATORS = Object.freeze(['human', 'ontogenesis', 'orchestrator', 'sub_orchestrator']);
const READ_ONLY_ROLES = Object.freeze(['resident_daemon', 'scout_cell', 'sentinel_keeper']);
const MUTATING_ACTIONS = Object.freeze(['write', 'commit', 'push', 'merge', 'spawn', 'delegate', 'promote']);
const ACTIONS = Object.freeze(['read', 'observe', 'signal', 'test_safe', 'snapshot', ...MUTATING_ACTIONS]);
const STATES = Object.freeze(['proposed', 'active', 'suspended', 'revoked', 'expired']);
const ACKS = Object.freeze(['none', 'semantic_ack', 'action_ack', 'verified_ack', 'human_confirmation']);
const ENGINE_VERSION = 'genos-rpe/1.0.0';

module.exports = {
  ROLES, LINEAGE, TYPES, BLIND_TYPES, CONTROL_EVENTS, DELEGATORS,
  READ_ONLY_ROLES, MUTATING_ACTIONS, ACTIONS, STATES, ACKS, ENGINE_VERSION
};
