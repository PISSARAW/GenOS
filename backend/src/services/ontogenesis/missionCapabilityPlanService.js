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

function buildMissionCapabilityPlan(input) {
  const mission = input.mission || {};
  const config = input.config || {};
  const concepts = mission.concepts || { operational: [], unavailable: [] };
  const required = unique([...(mission.capabilities || []), ...operationalConcepts(concepts)]);
  const topology = input.selection?.topology || mission.morphology?.selectedTopology || null;
  const organization = mission.morphology?.selectedOrganization || null;
  const topologyContract = topologyCapabilityService.contractFor({ mode: topology, organization });
  return {
    version: 1,
    projectId: input.project.id,
    taskId: input.task.id,
    domains: concepts.domains || [],
    requestedConcepts: (concepts.selectedConcepts || []).map((concept) => concept.id)
      .concat(concepts.selectedConcepts ? [] : (concepts.domains || [])),
    canonicalConcepts: concepts.canonicalConcepts || [],
    runtimeConcepts: concepts.runtimeConcepts || [],
    compatibleRuntimeConcepts: concepts.compatibleRuntimeConcepts || [],
    runtimeLeaseCandidates: concepts.runtimeLeaseCandidates || [],
    strategy: concepts.strategy || null,
    capabilityRequirements: required,
    capabilityCatalog: mission.capabilityCatalog || [],
    blockedCapabilities: concepts.unavailable || [],
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

module.exports = { buildMissionCapabilityPlan };
