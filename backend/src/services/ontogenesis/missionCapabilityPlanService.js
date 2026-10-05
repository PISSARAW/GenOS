'use strict';

const topologyCapabilityService = require('../topologyCapabilityService');

/**
 * Contrat universel entre une mission Ontogenèse et le runtime GenOS.
 * Le plan décrit ce qui peut être appelé et ce qui doit rester bloqué.
 */

function unique(values) {
  return [...new Set((values || []).filter((value) => typeof value === 'string' && value.trim()))];
}

function operationalConcepts(concepts) {
  return (concepts && concepts.operational || []).map((entry) => entry.capability);
}

function buildEvidenceContract(task, mission) {
  return {
    acceptance: task.acceptance_json || '[]',
    required: true,
    independent: true,
    promotion: 'gate_after_integrated_checks',
    falsification: unique(mission.profile && mission.profile.falsification)
  };
}

function buildRecoveryContract(config) {
  return {
    maxAttempts: 3,
    retry: 'bounded',
    rollback: true,
    deadLetter: 'WAITING_INPUT',
    humanReview: Boolean(config.authority && config.authority.rules && config.authority.rules.length)
  };
}

function philosophicalContractRequirements(concepts) {
  const entries = [...(concepts.resolvedConcepts || []), ...(concepts.selectedConcepts || [])]
    .filter((concept) => concept.implementationContractReference)
    .map((concept) => concept.implementationContractReference);
  const uniqueEntries = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  return { required: uniqueEntries.length > 0, promotionEligible: false, contracts: uniqueEntries };
}

const COGNITIVE_RUNTIME_CONCEPTS = new Set([
  'global_workspace', 'nonlinear_ignition', 'sustained_recurrence', 'metacognition',
  'predictive_inference', 'self_world_distinction', 'world_model', 'flexible_agency',
  'causal_integration', 'valence_interoception', 'report_access'
]);

function runtimeBridgePlan({ mission, concepts, topology, organization }) {
  const resolvedIds = new Set((concepts.resolvedConcepts || []).map((concept) => concept.id));
  const required = new Set([
    ...(mission.capabilities || []),
    ...(concepts.operational || []).map((entry) => entry.capability)
  ]);
  const bridges = [];
  if ([...COGNITIVE_RUNTIME_CONCEPTS].some((id) => resolvedIds.has(id))) {
    bridges.push({ id: 'concept-runtime', service: 'conceptRuntimeService', trigger: 'agent-process-event', promotionEligible: false });
  }
  if (['WEB_FORAGING', 'FOVEAL_PERCEPTION', 'COMPUTER_USE'].some((id) => required.has(id))) {
    bridges.push({ id: 'web-sensorium', services: ['browserScoutService', 'fovealVisionService', 'foragingScoutHarvesterService'], trigger: 'closed-loop-sensing', promotionEligible: false });
  }
  if (topology === 'biome') {
    bridges.push({ id: 'biome-vertical-slice', service: 'ontogenesis.tickService', trigger: 'capture-observe-decide-act-verify', promotionEligible: false });
  }
  if (required.has('PROVENANCE') || required.has('CAPSULES_SNAPSHOTS')) {
    bridges.push({ id: 'rust-node-contract', services: ['rustBridgeEvidenceService', 'rustNodeContractValidator'], trigger: 'snapshot-receipt-validation', promotionEligible: false });
  }
  if (topology === 'a_team' || organization) {
    bridges.push({ id: 'a-team-variant-runtime', service: 'variantExecutionRuntime', trigger: 'selected-variant', promotionEligible: false });
  }
  return bridges;
}

function buildMissionCapabilityPlan(input) {
  const mission = input.mission || {};
  const config = input.config || {};
  const concepts = mission.concepts || { operational: [], unavailable: [] };
  const required = unique([...(mission.capabilities || []), ...operationalConcepts(concepts)]);
  const topology = input.selection?.topology || mission.morphology?.selectedTopology || null;
  const organization = mission.morphology?.selectedOrganization || null;
  const topologyContract = topologyCapabilityService.contractFor({ mode: topology, organization });
  const runtimeBridges = runtimeBridgePlan({ mission, concepts, topology, organization });
  return {
    version: 1,
    projectId: input.project.id,
    taskId: input.task.id,
    domains: concepts.domains || [],
    requestedConcepts: (concepts.selectedConcepts || []).map((concept) => concept.id)
      .concat(concepts.selectedConcepts ? [] : (concepts.domains || [])),
    resolvedConcepts: concepts.resolvedConcepts || [],
    blockedConcepts: concepts.blockedConcepts || [],
    canonicalConcepts: concepts.canonicalConcepts || [],
    runtimeConcepts: concepts.runtimeConcepts || [],
    compatibleRuntimeConcepts: concepts.compatibleRuntimeConcepts || [],
    runtimeLeaseCandidates: concepts.runtimeLeaseCandidates || [],
    strategy: concepts.strategy || null,
    capabilityRequirements: required,
    capabilityCatalog: mission.capabilityCatalog || [],
    blockedCapabilities: concepts.unavailable || [],
    philosophicalContracts: philosophicalContractRequirements(concepts),
    runtimeBridges,
    morphology: mission.morphology || null,
    topology,
    organization,
    topologyContract,
    variant: input.selection && input.selection.variant,
    authority: config.authority || {},
    budgets: config.missionBudgets || config.budgets || {},
    evidence: buildEvidenceContract(input.task, mission),
    recovery: buildRecoveryContract(config),
    failClosed: true
  };
}

module.exports = { buildMissionCapabilityPlan, runtimeBridgePlan };
