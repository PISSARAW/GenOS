'use strict';

async function loadVerifiedMetric(input, dependencies) {
  if (typeof dependencies.loadVerifiedCommunicationMetric !== 'function') return null;
  const mission = input.state.normalizedMission || {};
  try {
    const metric = await dependencies.loadVerifiedCommunicationMetric({
      missionId: mission.missionId || input.orchestratorId
    });
    return metric && !Array.isArray(metric) ? metric : null;
  } catch (_) {
    return null;
  }
}

function plan(input, decision, communicationMetric) {
  const recipe = decision.policy.decision.recipe;
  const communicationIntervention = { candidateId: recipe.candidateId,
    scale: 'COMMUNICATION_REDUCTION', status: 'selected' };
  const receipt = { status: 'ADAPTED', interventionScale: 'COMMUNICATION_REDUCTION',
    candidateId: recipe.candidateId, communicationIntervention,
    communicationMetricReceipt: communicationMetric.receipt };
  return { adapted: true, assignments: {}, communicationIntervention, communicationMetric,
    receipt, decision, reason: 'calibrated_communication_reduction' };
}

function selected(decision) {
  return decision.policy.decision.interventionScale === 'COMMUNICATION_REDUCTION';
}

module.exports = { loadVerifiedMetric, plan, selected };
