'use strict';

function normalizeUnresolvedResponseValue1(__genosValueScope1) {
  return __genosValueScope1.response.outcome !== 'unresolved' || (__genosValueScope1.response.claims || []).length > 0
    || (__genosValueScope1.Array.isArray(__genosValueScope1.response.uncertainties) && __genosValueScope1.response.uncertainties.length > 0);
}

function recoverExhaustedAllocationValue2(__genosValueScope2) {
  return !__genosValueScope2.Number.isInteger(__genosValueScope2.maxAttempts) || __genosValueScope2.maxAttempts < 1 || !__genosValueScope2.Number.isInteger(__genosValueScope2.attempt) || __genosValueScope2.attempt < __genosValueScope2.maxAttempts;
}

function normalizeGenerationResultValue3(__genosValueScope3) {
  return (0, __genosValueScope3.require)('../agents/workerArtifactResponseSchema').workerArtifactResponseFormat(
    __genosValueScope3.mission.workerKind || __genosValueScope3.mission.role, [...new __genosValueScope3.Set(['mission', ...__genosValueScope3.supplied.filter((item) => typeof item === 'string' && item.trim())])],
    { diagnosis: /artifact=diagnostic_matrix/i.test(__genosValueScope3.mission.prompt || ''),
      missionCriteria: __genosValueScope3.mission.missionCriteria || [], handoffs: __genosValueScope3.mission.handoffContext || [] });
}

module.exports = { normalizeUnresolvedResponseValue1, recoverExhaustedAllocationValue2, normalizeGenerationResultValue3 };
