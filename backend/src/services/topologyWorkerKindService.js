'use strict';

const workerKinds = require('./agents/workerKindService');

const ROLE_REQUIREMENTS = Object.freeze({
  environment_mapper: ['observe'], resource_steward: ['analyze', 'domain_specialization'],
  population_specialist: ['domain_specialization'], ecosystem_observer: ['observe'],
  shared_state_coordinator: ['coordinate'], parallel_executor: ['scoped_execution'],
  consistency_guardian: ['verify'], integration_executor: ['synthesize', 'preserve_provenance'],
  host_orchestrator: null, specialist_symbiont: ['host_bound'], immune_symbiont: ['adversarial_review'],
  memory_symbiont: ['synthesize', 'preserve_provenance'], community_facilitator: ['coordinate'],
  independent_solver: ['scoped_execution'], generator: ['scoped_execution'],
  adversarial_reviewer: ['adversarial_review'], reviewer: ['verify'], consensus_observer: ['verify'],
  verifier: ['verify'], rootless_coordinator: ['coordinate'], capability_offshoot: ['domain_specialization'],
  local_bridge: ['handoff'], boundary_scout: ['observe'], population_isolator: ['scoped_execution'],
  quorum_sensor: ['observe'], synaptic_adaptor: ['adaptive_strategy'], regeneration_steward: ['recover'],
  security_reviewer: ['verify'], quality_engineer: ['verify'], literary_critic: ['verify'],
  integration_observer: ['synthesize', 'preserve_provenance'], literary_author: ['create_candidate'],
  dramaturg: ['create_candidate'], direct_author: ['create_candidate'], planned_author: ['create_candidate'],
  self_correcting_literary_author: ['create_candidate'], red_team: ['adversarial_review'],
  independent_reviewer: ['verify'], neutral_observer: ['observe'], recovery_specialist: ['recover'],
  contract_auditor: ['verify'], analyst: ['analyze'], implementation: ['scoped_execution'],
  basic_implementation: ['scoped_execution'], interview_plan_implementation: ['domain_specialization'],
  self_correcting_implementation: ['adaptive_strategy'], baseline_security_engineer: ['scoped_execution'],
  threat_model_engineer: ['domain_specialization'], adversarial_security_engineer: ['adversarial_review'],
  baseline_data_engineer: ['scoped_execution'], planned_data_engineer: ['domain_specialization'],
  data_validation_engineer: ['verify'], baseline_product_designer: ['scoped_execution'],
  planned_product_designer: ['domain_specialization'], usability_critic: ['verify'],
  graph_analyzer: ['analyze', 'domain_specialization'],
  epistemic_specialist: ['analyze'],
  teacher: ['teach'],
  medical_reviewer: ['clinical_context'],
  clinical_educator: ['clinical_context'],
  causal_reconstructor: ['analyze', 'causal_analysis'],
  transactional_validator: ['verify'],
  code_semantic_reviewer: ['verify', 'adversarial_review']
});

const ROLE_PREFERENCES = Object.freeze({
  observe: ['scout_cell', 'resident_daemon'], coordinate: ['liaison_worker', 'sub_orchestrator'],
  scoped_execution: ['bounded_worker', 'procedural_executor'],
  domain_specialization: ['specialist'], adaptive_strategy: ['adaptive_worker'],
  verify: ['verifier_worker'], adversarial_review: ['red_worker'],
  synthesize: ['synthesis_worker'], preserve_provenance: ['synthesis_worker'], create_candidate: ['creative_worker'],
  recover: ['recovery_worker'], handoff: ['liaison_worker'], host_bound: ['symbiotic_worker'],
  deterministic_procedure: ['procedural_executor'], formal_proof: ['formal_worker'],
  experiment: ['experimental_worker'], causal_analysis: ['forensic_worker'], teach: ['teaching_worker']
});

function assignmentError(message, code, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function values(list) {
  return Array.isArray(list) ? list.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function methodContractFor(member) {
  const supplied = member.methodContract;
  if (supplied === undefined || supplied === null) {
    return { version: 1, methodId: 'prompt_defined', source: 'mission_prompt', requiredCapabilities: [] };
  }
  if (!supplied || supplied.version !== 1 || typeof supplied.methodId !== 'string' || !supplied.methodId.trim()) {
    throw assignmentError('methodContract requires version 1 and a non-empty methodId.', 'WORKER_METHOD_CONTRACT_INVALID');
  }
  const methodId = workerKinds.normalize(supplied.methodId);
  if (methodId === 'prompt_defined') return { ...supplied, methodId, requiredCapabilities: [] };
  const requiredCapabilities = [...new Set([
    ...(workerKinds.METHOD_CAPABILITIES[methodId] || []), ...values(supplied.requiredCapabilities)
  ])];
  if (!requiredCapabilities.length) {
    throw assignmentError(`Method '${methodId}' has no registered worker capability; declare requiredCapabilities explicitly.`,
      'WORKER_METHOD_UNSUPPORTED', { methodId });
  }
  return { ...supplied, methodId, requiredCapabilities };
}

function roleRequirements(member) {
  const role = workerKinds.normalize(member.role);
  const declared = values(member.workerRequirements?.requiredCapabilities);
  const intent = roleIntent(role);
  if (intent === null) return null;
  const memberCapabilities = values(member.capabilities);
  const base = intent || memberCapabilities;
  if (!base.length && !declared.length) return undefined;
  return [...new Set([...base, ...declared])];
}

function roleIntent(role) {
  if (Object.hasOwn(ROLE_REQUIREMENTS, role)) return ROLE_REQUIREMENTS[role];
  if (role.endsWith('_engineer') || role.endsWith('_scientist') || role === 'mathematician') {
    return ['domain_specialization'];
  }
  return role.endsWith('_specialist') ? ['domain_specialization'] : undefined;
}

function memberRequirements(member, methodContract) {
  return [...new Set([
    ...roleRequirements(member),
    ...values(methodContract.requiredCapabilities)
  ])];
}

function kindSatisfies(kind, requirements) {
  const capabilities = workerKinds.KIND_CAPABILITIES[kind] || [];
  return requirements.every((required) => capabilities.includes(required));
}

function selectWorkerKind(member, requirements) {
  const candidates = Object.keys(workerKinds.KINDS).filter((kind) => kindSatisfies(kind, requirements));
  const allowed = values(member.workerRequirements?.allowedKinds);
  const compatible = candidates.filter((kind) => !allowed.length || allowed.includes(kind));
  if (!compatible.length) {
    throw assignmentError(`No WorkerKind satisfies capabilities [${requirements.join(', ')}] for role '${member.role}'.`,
      'WORKER_KIND_CAPABILITY_UNSATISFIED', { role: member.role, requiredCapabilities: requirements });
  }
  if (member.workerKind && member.workerAssignment?.selectionSource !== 'capability_match') {
    const explicit = workerKinds.resolveWorkerKind(member.workerKind);
    if (!compatible.includes(explicit)) {
      throw assignmentError(`Worker kind '${explicit}' does not satisfy role '${member.role}' capabilities [${requirements.join(', ')}].`,
        'WORKER_KIND_CAPABILITY_MISMATCH', { actual: explicit, requiredCapabilities: requirements });
    }
    return { kind: explicit, source: 'explicit', candidates: compatible };
  }
  const preference = requirements.flatMap((capability) => ROLE_PREFERENCES[capability] || []);
  const selected = preference.find((kind) => compatible.includes(kind)) || compatible[0];
  return { kind: selected, source: 'capability_match', candidates: compatible };
}

function orchestratorAssignment(mode, member) {
  if (member.workerKind) {
    throw assignmentError(`Topology ${mode} role '${member.role}' is an orchestrator and cannot have a worker kind.`,
      'TOPOLOGY_WORKER_KIND_MISMATCH', { expected: null, actual: member.workerKind });
  }
  return { ...member, workerKind: null, workerAssignment: null, executionMode: 'orchestrator' };
}

function resolveMember(mode, member) {
  if (!member || typeof member !== 'object' || !String(member.role || '').trim()) {
    throw assignmentError(`Topology ${mode} contains an invalid member assignment.`, 'TOPOLOGY_WORKER_KIND_MISSING');
  }
  const roleCapabilities = roleRequirements(member);
  if (roleCapabilities === null) return orchestratorAssignment(mode, member);
  if (roleCapabilities === undefined) {
    throw assignmentError(`No capability requirements are defined for ${mode} role '${member.role}'.`,
      'TOPOLOGY_WORKER_KIND_MISSING');
  }
  const methodContract = methodContractFor(member);
  const requirements = memberRequirements(member, methodContract);
  let selection;
  try {
    selection = selectWorkerKind(member, requirements);
  } catch (error) {
    if (error.code === 'UNKNOWN_WORKER_KIND') error.code = 'TOPOLOGY_WORKER_KIND_UNKNOWN';
    throw error;
  }
  require('./agents/workerRuntimeLimitsService').assertWorkerExecutorAvailable({ workerKind: selection.kind, methodContract });
  const definition = workerKinds.kindDefinition(selection.kind);
  const workerAssignment = buildWorkerAssignment({ mode, member, selection, requirements, methodContract });
  return {
    ...member,
    workerKind: selection.kind,
    methodContract,
    workerAssignment,
    mission: appendMethodContract(member.mission, methodContract),
    workerKindReason: `${selection.kind} satisfait [${requirements.join(', ')}] pour ${mode}:${member.role}.`,
    workerArtifact: definition.artifact,
    executionMode: 'worker'
  };
}

function buildWorkerAssignment({ mode, member, selection, requirements, methodContract }) {
  return {
    version: 1,
    topology: mode,
    topologyRole: member.role,
    workerKind: selection.kind,
    selectionSource: selection.source,
    requiredCapabilities: requirements,
    compatibleKinds: selection.candidates,
    methodContract,
    ...specialistFields(mode, member, selection.kind),
    ...symbioticFields(member, selection.kind)
  };
}

function specialistFields(mode, member, kind) {
  if (kind !== 'specialist') return {};
  return { nicheDomain: member.nicheDomain || member.workerRequirements?.nicheDomain
    || member.label || `${mode}:${member.role}` };
}

function symbioticFields(member, kind) {
  if (kind !== 'symbiotic_worker') return {};
  return {
    hostContractId: member.hostContractId || member.workerRequirements?.hostContractId || null,
    hostCapabilities: member.hostCapabilities || member.workerRequirements?.hostCapabilities || [],
    hostId: member.hostId || member.workerRequirements?.hostId || null
  };
}

function appendMethodContract(mission, methodContract) {
  if (!methodContract || methodContract.methodId === 'prompt_defined') return mission;
  const text = `\n\nMETHOD CONTRACT (${methodContract.methodId}): ${JSON.stringify(methodContract)}. Follow this contract exactly; report required evidence and state any unmet precondition.`;
  return `${mission || ''}${text}`;
}

function withRequestedAssignment(member, requested) {
  if (!requested || typeof requested !== 'object') return member;
  const base = member.workerAssignment?.selectionSource === 'capability_match'
    ? { ...member, workerKind: undefined, workerAssignment: undefined } : member;
  return { ...base, ...requested };
}

function assignmentForRole(assignments, role) {
  return assignments && !Array.isArray(assignments) ? assignments[role] : null;
}

function applyTopologyWorkerKinds(mode, composition, assignments = {}) {
  const mapMember = (member) => resolveMember(mode,
    withRequestedAssignment(member, assignmentForRole(assignments, member.role)));
  if (Array.isArray(composition)) return composition.map(mapMember);
  if (!Array.isArray(composition?.members)) return composition;
  return { ...composition, members: composition.members.map(mapMember) };
}

function workerPlanFor(members) {
  return members.map(({ role, workerKind, workerKindReason, methodContract }) => ({
    role, workerKind, methodId: methodContract?.methodId || null, reason: workerKindReason
  }));
}

module.exports = { ROLE_REQUIREMENTS, applyTopologyWorkerKinds, workerPlanFor };
