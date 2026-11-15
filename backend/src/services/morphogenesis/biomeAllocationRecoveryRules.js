'use strict';

function normalizeUnresolvedResponse(context) {
  return context.response.outcome !== 'unresolved' || (context.response.claims || []).length > 0
    || (context.Array.isArray(context.response.uncertainties) && context.response.uncertainties.length > 0);
}

function recoverExhaustedAllocation(context) {
  return !context.Number.isInteger(context.maxAttempts) || context.maxAttempts < 1 || !context.Number.isInteger(context.attempt) || context.attempt < context.maxAttempts;
}

function normalizeGenerationResult(context) {
  return context.require('../agents/workerArtifactResponseSchema').workerArtifactResponseFormat(
    context.mission.workerKind || context.mission.role, [...new context.Set(['mission', ...context.supplied.filter((item) => typeof item === 'string' && item.trim())])],
    { diagnosis: /artifact=diagnostic_matrix/i.test(context.mission.prompt || ''),
      missionCriteria: context.mission.missionCriteria || [], handoffs: context.mission.handoffContext || [] });
}

module.exports = { normalizeUnresolvedResponse, recoverExhaustedAllocation, normalizeGenerationResult };
