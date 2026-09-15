'use strict';

/**
 * @file topologyCapabilityService.js
 * @description Machine-readable capability contract mapping every GenOS
 * orchestration topology (modes + organizations) to the concepts it needs to
 * operate at full capacity. It is declarative: it does not execute anything,
 * it lets the autonomy plan, leases and audit surface what a topology requires
 * and what is still missing.
 */

const GENOS_CAPABILITIES = Object.freeze([
  'STRATEGY_PORTFOLIO', 'STRATEGY_ADAPTATION', 'ARENA_COMPETITION', 'PROMOTION_GATE',
  'TOKEN_ECONOMY', 'EVIDENCE_BARRIER', 'EPISTEMICS_BRIER', 'HALLUCINATION_MONITORING',
  'OUTPUT_GOVERNOR', 'PROVENANCE', 'GRAPH_MEMORY', 'VECTOR_MEMORY', 'EPISODIC_MEMORY',
  'SYNAPTIC_PLASTICITY', 'SIGNALING_BUS', 'LIGAND_RECEPTOR', 'STIGMERGY', 'SWARM_METRICS',
  'QUORUM', 'GENOME_EPIGENETICS', 'EVOLUTION_REPRODUCTION', 'IMMUNE_SYSTEM',
  'CONSCIENCE_HOMEOSTASIS', 'RESILIENCE_RECOVERY', 'CHAOS_ENGINEERING', 'CRDT_SHARED_STATE',
  'VFS_SANDBOX', 'CAPSULES_SNAPSHOTS', 'MODEL_ROUTING', 'LOCAL_INFERENCE', 'INFERENCE_GATEWAY',
  'OBSERVABILITY', 'GOVERNANCE_APPROVAL', 'COMPLIANCE', 'WEB_FORAGING', 'FOVEAL_PERCEPTION',
  'COMPUTER_USE'
]);

const MODE_CAPABILITIES = Object.freeze({
  trinity: ['STRATEGY_PORTFOLIO', 'EVIDENCE_BARRIER', 'EPISTEMICS_BRIER', 'HALLUCINATION_MONITORING', 'ARENA_COMPETITION', 'PROMOTION_GATE', 'TOKEN_ECONOMY', 'GRAPH_MEMORY', 'PROVENANCE', 'OBSERVABILITY'],
  a_team: ['STRATEGY_PORTFOLIO', 'EVIDENCE_BARRIER', 'SIGNALING_BUS', 'LIGAND_RECEPTOR', 'ARENA_COMPETITION', 'TOKEN_ECONOMY', 'GRAPH_MEMORY', 'WEB_FORAGING', 'OBSERVABILITY'],
  biome: ['TOKEN_ECONOMY', 'STIGMERGY', 'SWARM_METRICS', 'QUORUM', 'WEB_FORAGING', 'FOVEAL_PERCEPTION', 'EPISODIC_MEMORY', 'RESILIENCE_RECOVERY'],
  biocenose: ['QUORUM', 'EPISTEMICS_BRIER', 'ARENA_COMPETITION', 'EVIDENCE_BARRIER', 'SWARM_METRICS', 'SIGNALING_BUS', 'PROMOTION_GATE'],
  holobionte: ['IMMUNE_SYSTEM', 'CONSCIENCE_HOMEOSTASIS', 'LOCAL_INFERENCE', 'INFERENCE_GATEWAY', 'GRAPH_MEMORY', 'EPISODIC_MEMORY', 'GENOME_EPIGENETICS', 'SIGNALING_BUS'],
  syncytium: ['CRDT_SHARED_STATE', 'SIGNALING_BUS', 'VFS_SANDBOX', 'OUTPUT_GOVERNOR', 'LOCAL_INFERENCE', 'OBSERVABILITY'],
  rhizome: ['SIGNALING_BUS', 'LIGAND_RECEPTOR', 'STIGMERGY', 'STRATEGY_ADAPTATION', 'GRAPH_MEMORY', 'WEB_FORAGING'],
  metapopulation: ['QUORUM', 'SYNAPTIC_PLASTICITY', 'RESILIENCE_RECOVERY', 'GENOME_EPIGENETICS', 'SWARM_METRICS', 'EPISODIC_MEMORY']
});

const MODE_PROFILES = Object.freeze({
  trinity: { evidence: 'comparative_barrier', memory: 'isolated_write_shared_read', budget: 'pooled', communication: 'orchestrator_mediated', engines: { coordinator: 'frontier', worker: 'mixed' } },
  a_team: { evidence: 'per_domain_dossier', memory: 'shared_read', budget: 'per_domain', communication: 'orchestrator_mediated', engines: { coordinator: 'frontier', worker: 'mixed' } },
  biome: { evidence: 'ecological_observation', memory: 'environmental', budget: 'pooled', communication: 'shared_trail', engines: { coordinator: 'frontier', worker: 'mixed' } },
  biocenose: { evidence: 'weighted_consensus', memory: 'shared_read', budget: 'pooled', communication: 'broadcast', engines: { coordinator: 'frontier', worker: 'mixed' } },
  holobionte: { evidence: 'host_veto', memory: 'vertical_transmission', budget: 'host_controlled', communication: 'capability', engines: { coordinator: 'frontier', worker: 'local' } },
  syncytium: { evidence: 'invariant_consistency', memory: 'crdt_shared', budget: 'pooled', communication: 'continuous_sync', engines: { coordinator: 'frontier', worker: 'local' } },
  rhizome: { evidence: 'distributed_dossier', memory: 'distributed', budget: 'per_branch', communication: 'capability_mesh', engines: { coordinator: 'frontier', worker: 'mixed' } },
  metapopulation: { evidence: 'quorum_dossier', memory: 'lineage_recovery', budget: 'pooled', communication: 'adaptive_neighbors', engines: { coordinator: 'frontier', worker: 'mixed' } }
});

const ORGANIZATION_CAPABILITIES = Object.freeze({
  specialist_expert_committee: ['SIGNALING_BUS', 'EVIDENCE_BARRIER', 'PROVENANCE', 'OBSERVABILITY'],
  blind_adversarial_review: ['ARENA_COMPETITION', 'HALLUCINATION_MONITORING', 'EVIDENCE_BARRIER', 'IMMUNE_SYSTEM'],
  red_blue_coevolution: ['ARENA_COMPETITION', 'IMMUNE_SYSTEM', 'EVIDENCE_BARRIER', 'PROMOTION_GATE'],
  brier_weighted_consensus: ['EPISTEMICS_BRIER', 'EVIDENCE_BARRIER', 'QUORUM'],
  quorum_with_abstention: ['QUORUM', 'EPISTEMICS_BRIER', 'EVIDENCE_BARRIER'],
  stigmergy: ['STIGMERGY', 'SIGNALING_BUS', 'SWARM_METRICS'],
  flocking_boids: ['SWARM_METRICS', 'SIGNALING_BUS'],
  fish_school_search: ['SWARM_METRICS', 'SIGNALING_BUS'],
  slime_mould_network: ['STIGMERGY', 'SIGNALING_BUS', 'STRATEGY_ADAPTATION'],
  grey_wolf_optimizer: ['SWARM_METRICS', 'TOKEN_ECONOMY'],
  mycelial_routing: ['LIGAND_RECEPTOR', 'SIGNALING_BUS', 'STRATEGY_ADAPTATION'],
  dynamic_polyethism: ['STRATEGY_ADAPTATION', 'LIGAND_RECEPTOR'],
  energy_huddle: ['TOKEN_ECONOMY', 'SWARM_METRICS'],
  network_silence: ['CAPSULES_SNAPSHOTS', 'VFS_SANDBOX'],
  strategy_arena: ['ARENA_COMPETITION', 'STRATEGY_PORTFOLIO', 'PROMOTION_GATE'],
  hierarchical_merge: ['EVIDENCE_BARRIER', 'PROVENANCE', 'PROMOTION_GATE'],
  competitive_arena: ['ARENA_COMPETITION', 'EPISTEMICS_BRIER'],
  isolated_recovery: ['RESILIENCE_RECOVERY', 'CAPSULES_SNAPSHOTS', 'CHAOS_ENGINEERING'],
  memory_compilation: ['GRAPH_MEMORY', 'VECTOR_MEMORY', 'EPISODIC_MEMORY']
});

const MODE_ALIASES = Object.freeze({ a_team: 'a_team', ateam: 'a_team', 'a-team': 'a_team' });

function normalizeKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return MODE_ALIASES[key] || key;
}

function requiredCapabilities(keys) {
  return [...new Set((keys || []).filter((key) => GENOS_CAPABILITIES.includes(key)))].sort();
}

function capabilitiesForMode(mode) {
  const key = normalizeKey(mode);
  if (!MODE_CAPABILITIES[key]) return null;
  return { topology: key, kind: 'mode', required: requiredCapabilities(MODE_CAPABILITIES[key]), profile: MODE_PROFILES[key] || null };
}

function capabilitiesForOrganization(organization) {
  const key = normalizeKey(organization);
  if (!ORGANIZATION_CAPABILITIES[key]) return null;
  return { topology: key, kind: 'organization', required: requiredCapabilities(ORGANIZATION_CAPABILITIES[key]), profile: null };
}

function contractFor(options = {}) {
  const mode = capabilitiesForMode(options.mode);
  const organization = capabilitiesForOrganization(options.organization);
  return {
    mode: mode ? mode.topology : null,
    organization: organization ? organization.topology : null,
    required: requiredCapabilities([...(mode ? mode.required : []), ...(organization ? organization.required : [])]),
    profile: mode ? mode.profile : null
  };
}

function missingCapabilities(contract, available = []) {
  const provided = new Set((available || []).map(normalizeKey));
  return (contract && Array.isArray(contract.required) ? contract.required : []).filter((capability) => !provided.has(normalizeKey(capability)));
}

function auditTopology(options = {}) {
  const contract = contractFor(options);
  return { contract, provided: requiredCapabilities((options.available || []).map(normalizeKey)), missing: missingCapabilities(contract, options.available) };
}

module.exports = {
  GENOS_CAPABILITIES,
  MODE_CAPABILITIES,
  MODE_PROFILES,
  ORGANIZATION_CAPABILITIES,
  capabilitiesForMode,
  capabilitiesForOrganization,
  contractFor,
  missingCapabilities,
  auditTopology,
  structuralPlasticityIndex: require('./structuralPlasticityIndex').structuralPlasticityIndex
};
