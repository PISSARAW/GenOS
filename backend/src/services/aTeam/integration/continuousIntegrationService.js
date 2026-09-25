'use strict';

const { observeAteamIntegration } = require('../../aTeamIntegrationObserver');
const { evaluateQualityGate } = require('../../aTeamQualityGateService');
const { validateWorkGraph } = require('../workGraph/graphValidation');
const { planRepairWithMemory } = require('../adaptation/teamRepairService');

function graphHealth(graph) {
  if (!graph) return { available: false, valid: null, errors: [] };
  const result = validateWorkGraph(graph);
  return { available: true, valid: result.valid, errors: result.errors };
}

function blockingHandoffs(aTeam) {
  const direct = Array.isArray(aTeam.runtimeHandoffs) ? aTeam.runtimeHandoffs : [];
  const memberHandoffs = (Array.isArray(aTeam.members) ? aTeam.members : [])
    .flatMap((member) => Array.isArray(member.handoffContext) ? member.handoffContext : []);
  return [...direct, ...memberHandoffs].filter((handoff) => handoff.blocking !== false && handoff.accepted !== true);
}

function capabilityFailures(aTeam) {
  if (!aTeam.capabilityCoverage) return [];
  const gate = evaluateQualityGate({ capabilityCoverage: aTeam.capabilityCoverage });
  return gate.coverage.failedDimensions.map((dimension) => ({
    code: 'ATEAM_COVERAGE_DIMENSION_UNAVAILABLE', dimension: dimension.name,
    message: `${dimension.name} is ${dimension.ratio === null ? 'unavailable' : 'zero or invalid'}.`
  }));
}

function unresolvedContracts(aTeam, observation) {
  const explicit = Array.isArray(aTeam.unresolvedContracts) ? aTeam.unresolvedContracts : [];
  return [
    ...explicit,
    ...blockingHandoffs(aTeam).map((handoff) => ({ handoffId: handoff.handoffId, status: handoff.status || 'PENDING' })),
    ...observation.integrationFailures.map((failure) => ({ code: failure.code, workerId: failure.workerId }))
  ];
}

function integrationFailures(observation, health) {
  if (health.valid !== false) return observation.failures;
  return [...observation.failures, ...health.errors.map((message) => ({ code: 'WORK_GRAPH_INVALID', message }))];
}

async function runContinuousIntegration(input = {}) {
  const aTeam = input.aTeam || {};
  const observation = observeAteamIntegration({ members: aTeam.members, workers: input.workers, dossiers: input.dossiers });
  const health = graphHealth(aTeam.workGraph);
  const failures = [...(Array.isArray(input.failures) ? input.failures : []), ...integrationFailures(observation, health), ...capabilityFailures(aTeam)];
  const contracts = unresolvedContracts(aTeam, observation);
  const repairPlan = await planRepairWithMemory({
    db: input.db, findExperts: input.findExperts, freshness: input.freshness,
    gaps: aTeam.capabilityGaps || aTeam.capabilityCoverage?.uncovered?.map((capability) => ({ capability })) || [],
    members: aTeam.members,
    candidates: aTeam.recruitmentCandidates,
    budget: aTeam.repairBudget,
    availableSlots: aTeam.availableSlots
  });
  const warnings = health.available ? [] : ['WorkGraph health was not supplied.'];
  return {
    readyToIntegrate: failures.length === 0 && contracts.length === 0,
    blockingFailures: failures,
    warnings,
    integrationGraphHealth: health,
    uncoveredCapabilities: aTeam.capabilityCoverage?.uncovered || [],
    unresolvedContracts: contracts,
    repairPlan,
    observation
  };
}

module.exports = { runContinuousIntegration };
