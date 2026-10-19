'use strict';

async function apply({ autonomyPlan, normalizedMission, db, agentId, dispatchedAgent }) {
  if (!genericRequested(normalizedMission)) return;
  if (autonomyPlan.trinity?.activated && autonomyPlan.trinity?.hypothesisDesign?.hypothesisGeneration) {
    autonomyPlan.hypothesisGeneration = autonomyPlan.trinity.hypothesisDesign.hypothesisGeneration;
    return;
  }
  const cognitiveExecutor = require('./cognitiveExecutor');
  const missionText = normalizedMission.prompt || normalizedMission.currentTask || '';
  const generated = await cognitiveExecutor.generateProposals({
    mission: { prompt: missionText, executionBudget: normalizedMission.executionBudget || {} },
    db, agentId,
    tenant: { organizationId: dispatchedAgent?.organization_id, projectId: dispatchedAgent?.project_id }
  });
  const verified = await cognitiveExecutor.verifyGeneratedHypotheses({
    generated, evidence: [], receipts: [], trustedVerifierDigests: []
  });
  autonomyPlan.hypothesisGeneration = {
    ...generated,
    falsification: verified.falsification,
    scientificValidity: verified.scientificValidity,
    promotionEligible: verified.promotionEligible
  };
  if (generated.status === 'generated') {
    const { emit } = require('./agentOrchestrationState');
    emit(agentId, 'HYPOTHESIS_GENERATION_COMPLETED', 'HYPOTHESIS',
      `Generated ${generated.proposals.length} cross-topology hypotheses.`,
      autonomyPlan.hypothesisGeneration, 'info');
  }
}

function genericRequested(normalizedMission) {
  const cross = normalizedMission.hypothesisGeneration || normalizedMission.hypothesis_generation;
  if (cross && cross.enabled === true) return true;
  const trinity = normalizedMission.trinityHypothesisDesign || normalizedMission.trinity_hypothesis_design;
  return Boolean(trinity && trinity.generateHypotheses === true);
}

module.exports = { apply, genericRequested };
