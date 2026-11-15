'use strict';

function runChainRule1(context) {
  return {
    organizationId: 'org-a', projectId: context.projectId, agentId: context.agentId, observationId: context.observationId, nowMs: context.NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition: context.condition, cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: context.ctx.modelAdapter?.budget
        || { tokens: 1000, usd: 0.1, seconds: 60 },
      minScore: context.minimumScore(context.condition), minInformationGain: 0.1,
      minLearningProgress: 0.01 },
    assessment: context.assessment,
    ...(context.ctx.modelAdapter ? { questionGenerator: context.ctx.modelAdapter.questionGenerator } : {}),
    budget: context.ctx.modelAdapter?.budget || { tokens: 500, usd: 0.05, seconds: 30 }
  };
}

function runChainRule2(context) {
  return {
    success: !context.failed, episodes: 1, verified: context.v === 'supported', learned: context.learned, continued: context.continued,
    terminalState: context.finalEpisode.currentState,
    continuationError: context.ctx.continuationError || null,
    failure: context.failed ? { stage: 'continuation', code: context.ctx.continuationError,
      message: 'ETT continuation failed.' } : null
  };
}

function executeRule3(context) {
  return { stage: 'execution', code: context.error.code || 'ETT_CAMPAIGN_EXECUTION_FAILED',
        message: context.String(context.error.message).slice(0, 200), errors: context.error.errors || [] };
}

function runChainRule4(context) {
  return {
    success: !context.failed,
    episodes: 1,
    syntheticVerdict: context.v,
    learned: context.learned,
    continued: context.continued,
    terminalState: context.finalEpisode.currentState,
    developmentUtility: context.usefulDevelopmentResult(context.v, context.learned),
    continuationError: context.ctx.continuationError || null,
    failure: context.failed ? { stage: 'continuation', code: context.ctx.continuationError,
      message: 'Synthetic continuation failed.' } : null
  };
}

function modelOutcome(context) {
  return { episodeId: context.ctx.episodeId || null, questionRef: context.ctx.questionRef || null,
      runReceiptRef: context.ctx.runReceiptRef || null,
      verificationReceiptRef: context.ctx.verificationReceiptRef || null,
      learningId: context.ctx.learningId || null };
}

function executeRule6(context) {
  return { db: context.db, projectId: context.projectId, agentId: context.agentId, keys: context.keys, scenarioClass: context.scenarioClass, condition: context.condition, caseId: context.caseId,
      caseInput: context.caseInput, modelAdapter: context.modelAdapter,
      publicSummary: context.caseInput?.publicObservation ? context.JSON.stringify(context.caseInput.publicObservation) : null,
      evidenceRefs: context.caseInput?.publicObservation ? [`ett-case:${context.caseId}:observation`] : null };
}

module.exports = { runChainRule1, runChainRule2, executeRule3, runChainRule4, modelOutcome, executeRule6 };
