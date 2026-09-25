'use strict';

const workerKinds = require('./agents/workerKindService');

const MODE_ROLE_KINDS = Object.freeze({
  a_team: Object.freeze({}),
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
  }),
  trinity: Object.freeze({})
});

const KIND_REASONS = Object.freeze({
  adaptive_worker: 'le rôle demande une adaptation locale bornée',
  bounded_worker: 'le rôle exécute un périmètre de mission borné',
  creative_worker: 'le rôle produit un artefact créatif candidat',
  liaison_worker: 'le rôle coordonne ou transmet des éléments entre groupes',
  recovery_worker: 'le rôle restaure une capacité ou un état dégradé',
  red_worker: 'le rôle cherche activement à réfuter les résultats',
  scout_cell: 'le rôle observe et rapporte sans exécuter de changements',
  specialist: 'le rôle requiert une expertise de domaine déclarée',
  symbiotic_worker: 'le rôle fournit une capacité sous contrat de l’hôte',
  synthesis_worker: 'le rôle synthétise des dossiers en préservant leur provenance',
  verifier_worker: 'le rôle vérifie indépendamment les résultats'
});

function trinityKind(member) {
  if (!['direct', 'structured', 'falsification'].includes(member?.chamber)) return undefined;
  if (member?.domain === 'creative_writing') return 'creative_worker';
  return {
    direct: 'bounded_worker', structured: 'specialist', falsification: 'adaptive_worker'
  }[member.chamber];
}

function expectedWorkerKind(mode, member) {
  if (mode === 'trinity') return trinityKind(member);
  if (mode === 'a_team') {
    const role = String(member?.role || '').trim();
    if (['security_reviewer', 'quality_engineer', 'literary_critic'].includes(role)) return 'verifier_worker';
    if (role === 'integration_observer') return 'synthesis_worker';
    if (['literary_author', 'dramaturg', 'direct_author', 'planned_author', 'self_correcting_literary_author'].includes(role)) return 'creative_worker';
    return 'specialist';
  }
  return MODE_ROLE_KINDS[mode]?.[member?.role];
}

function orchestratorAssignment(mode, role, member) {
  if (member.workerKind && member.workerKind !== '') {
    throw Object.assign(new Error(`Topology ${mode} role '${role}' is an orchestrator and cannot have worker kind '${member.workerKind}'.`), {
      code: 'TOPOLOGY_WORKER_KIND_MISMATCH', expected: null, actual: member.workerKind
    });
  }
  return { ...member, workerKind: null, executionMode: 'orchestrator' };
}

function resolveAssignedKind(mode, role, member) {
  if (typeof member.workerKind !== 'string' || !member.workerKind.trim()) {
    throw Object.assign(new Error(`Topology ${mode} role '${role}' has no explicit worker kind.`), { code: 'TOPOLOGY_WORKER_KIND_MISSING' });
  }
  try {
    return workerKinds.resolveWorkerKind(member.workerKind);
  } catch (error) {
    error.code = 'TOPOLOGY_WORKER_KIND_UNKNOWN';
    throw error;
  }
}

function workerAssignment(mode, assignment, member) {
  const { role, expected } = assignment;
  const actual = resolveAssignedKind(mode, role, member);
  if (actual !== expected) {
    throw Object.assign(new Error(`Worker kind '${actual}' is incompatible with ${mode} role '${role}'; expected '${expected}'.`), {
      code: 'TOPOLOGY_WORKER_KIND_MISMATCH', expected, actual
    });
  }
  return {
    ...member,
    workerKind: actual,
    workerKindReason: `${KIND_REASONS[actual]} (${mode}:${role}).`,
    executionMode: 'worker'
  };
}

function validateMember(mode, member) {
  if (!member || typeof member !== 'object') {
    throw Object.assign(new Error(`Topology ${mode} contains an invalid member assignment.`), { code: 'TOPOLOGY_WORKER_KIND_MISSING' });
  }
  const role = String(member?.role || '').trim();
  const expected = expectedWorkerKind(mode, member);
  if (expected === undefined) {
    throw Object.assign(new Error(`No worker kind is defined for ${mode} role '${role}'.`), { code: 'TOPOLOGY_WORKER_KIND_MISSING' });
  }
  if (expected === null) {
    return orchestratorAssignment(mode, role, member);
  }
  return workerAssignment(mode, { role, expected }, member);
}

function applyToMember(mode, member) {
  return validateMember(mode, member);
}

function applyTopologyWorkerKinds(mode, composition) {
  const kinds = MODE_ROLE_KINDS[mode];
  if (!kinds && mode !== 'a_team' && mode !== 'trinity') return composition;
  if (Array.isArray(composition)) return composition.map((member) => applyToMember(mode, member));
  if (!Array.isArray(composition?.members)) return composition;
  return { ...composition, members: composition.members.map((member) => applyToMember(mode, member)) };
}

function workerPlanFor(members) {
  return members.map(({ role, workerKind, workerKindReason }) => ({ role, workerKind, reason: workerKindReason }));
}

module.exports = { MODE_ROLE_KINDS, applyTopologyWorkerKinds, workerPlanFor };
