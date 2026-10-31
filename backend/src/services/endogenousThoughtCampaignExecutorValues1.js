'use strict';

function runChainValue1(__genosValueScope1) {
  return {
    organizationId: 'org-a', projectId: __genosValueScope1.projectId, agentId: __genosValueScope1.agentId, observationId: __genosValueScope1.observationId, nowMs: __genosValueScope1.NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition: __genosValueScope1.condition, cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: __genosValueScope1.ctx.modelAdapter?.budget
        || { tokens: 1000, usd: 0.1, seconds: 60 },
      minScore: (0, __genosValueScope1.minimumScore)(__genosValueScope1.condition), minInformationGain: 0.1,
      minLearningProgress: 0.01 },
    assessment: __genosValueScope1.assessment,
    ...(__genosValueScope1.ctx.modelAdapter ? { questionGenerator: __genosValueScope1.ctx.modelAdapter.questionGenerator } : {}),
    budget: __genosValueScope1.ctx.modelAdapter?.budget || { tokens: 500, usd: 0.05, seconds: 30 }
  };
}

function runChainValue2(__genosValueScope2) {
  return {
    success: !__genosValueScope2.failed, episodes: 1, verified: __genosValueScope2.v === 'supported', learned: __genosValueScope2.learned, continued: __genosValueScope2.continued,
    terminalState: __genosValueScope2.finalEpisode.currentState,
    continuationError: __genosValueScope2.ctx.continuationError || null,
    failure: __genosValueScope2.failed ? { stage: 'continuation', code: __genosValueScope2.ctx.continuationError,
      message: 'ETT continuation failed.' } : null
  };
}

function executeValue3(__genosValueScope3) {
  return { stage: 'execution', code: __genosValueScope3.error.code || 'ETT_CAMPAIGN_EXECUTION_FAILED',
        message: (0, __genosValueScope3.String)(__genosValueScope3.error.message).slice(0, 200), errors: __genosValueScope3.error.errors || [] };
}

function runChainValue4(__genosValueScope4) {
  return {
    success: !__genosValueScope4.failed,
    episodes: 1,
    syntheticVerdict: __genosValueScope4.v,
    learned: __genosValueScope4.learned,
    continued: __genosValueScope4.continued,
    terminalState: __genosValueScope4.finalEpisode.currentState,
    developmentUtility: (0, __genosValueScope4.usefulDevelopmentResult)(__genosValueScope4.v, __genosValueScope4.learned),
    continuationError: __genosValueScope4.ctx.continuationError || null,
    failure: __genosValueScope4.failed ? { stage: 'continuation', code: __genosValueScope4.ctx.continuationError,
      message: 'Synthetic continuation failed.' } : null
  };
}

function modelOutcomeValue5(__genosValueScope5) {
  return { episodeId: __genosValueScope5.ctx.episodeId || null, questionRef: __genosValueScope5.ctx.questionRef || null,
      runReceiptRef: __genosValueScope5.ctx.runReceiptRef || null,
      verificationReceiptRef: __genosValueScope5.ctx.verificationReceiptRef || null,
      learningId: __genosValueScope5.ctx.learningId || null };
}

function executeValue6(__genosValueScope6) {
  return { db: __genosValueScope6.db, projectId: __genosValueScope6.projectId, agentId: __genosValueScope6.agentId, keys: __genosValueScope6.keys, scenarioClass: __genosValueScope6.scenarioClass, condition: __genosValueScope6.condition, caseId: __genosValueScope6.caseId,
      caseInput: __genosValueScope6.caseInput, modelAdapter: __genosValueScope6.modelAdapter,
      publicSummary: __genosValueScope6.caseInput?.publicObservation ? __genosValueScope6.JSON.stringify(__genosValueScope6.caseInput.publicObservation) : null,
      evidenceRefs: __genosValueScope6.caseInput?.publicObservation ? [`ett-case:${__genosValueScope6.caseId}:observation`] : null };
}

module.exports = { runChainValue1, runChainValue2, executeValue3, runChainValue4, modelOutcomeValue5, executeValue6 };
