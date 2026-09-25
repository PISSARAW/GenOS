'use strict';

const MODE_ROLE_KINDS = Object.freeze({
  biocenose: Object.freeze({
    community_facilitator: 'liaison_worker', independent_solver: 'bounded_worker',
    generator: 'bounded_worker', adversarial_reviewer: 'red_worker', reviewer: 'red_worker',
    consensus_observer: 'verifier_worker', verifier: 'verifier_worker'
  }),
  biome: Object.freeze({
    environment_mapper: 'scout_cell', resource_steward: 'bounded_worker',
    population_specialist: 'specialist', ecosystem_observer: 'scout_cell'
  }),
  holobionte: Object.freeze({
    host_orchestrator: null, specialist_symbiont: 'symbiotic_worker',
    immune_symbiont: 'red_worker', memory_symbiont: 'synthesis_worker'
  }),
  metapopulation: Object.freeze({
    population_isolator: 'bounded_worker', quorum_sensor: 'scout_cell',
    synaptic_adaptor: 'adaptive_worker', regeneration_steward: 'recovery_worker'
  }),
  rhizome: Object.freeze({
    rootless_coordinator: 'liaison_worker', capability_offshoot: 'specialist',
    local_bridge: 'liaison_worker', boundary_scout: 'scout_cell'
  }),
  syncytium: Object.freeze({
    shared_state_coordinator: 'liaison_worker', parallel_executor: 'bounded_worker',
    consistency_guardian: 'verifier_worker', integration_executor: 'synthesis_worker'
  })
});

function applyToMember(mode, member) {
  const kinds = MODE_ROLE_KINDS[mode];
  const role = String(member?.role || '').trim();
  if (!Object.prototype.hasOwnProperty.call(kinds, role)) {
    throw Object.assign(new Error(`No worker kind is defined for ${mode} role '${role}'.`), {
      code: 'TOPOLOGY_WORKER_KIND_MISSING'
    });
  }
  const workerKind = kinds[role];
  if (member.workerKind && member.workerKind !== workerKind) {
    throw Object.assign(new Error(`Worker kind for ${mode} role '${role}' conflicts with its topology contract.`), {
      code: 'TOPOLOGY_WORKER_KIND_MISMATCH'
    });
  }
  return {
    ...member,
    workerKind,
    ...(workerKind === null ? { executionMode: 'orchestrator' } : { executionMode: 'worker' })
  };
}

function applyTopologyWorkerKinds(mode, composition) {
  const kinds = MODE_ROLE_KINDS[mode];
  if (!kinds) return composition;
  if (Array.isArray(composition)) return composition.map((member) => applyToMember(mode, member));
  if (!Array.isArray(composition?.members)) return composition;
  return { ...composition, members: composition.members.map((member) => applyToMember(mode, member)) };
}

module.exports = { MODE_ROLE_KINDS, applyTopologyWorkerKinds };
