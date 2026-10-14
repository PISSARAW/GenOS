'use strict';

const { emit, updateAgent } = require('./agentOrchestrationState');

async function emitLocalCompleted(ctx, publishSuccess) {
  await updateAgent(ctx.mission.agentId, 'completed', ctx.statusText);
  const completed = emit(ctx.mission.agentId, ctx.eventType, ctx.kind, ctx.detail, {
    executionRunId: ctx.executionRun.id, model: ctx.model, provider: ctx.provider,
    evidenceReport: ctx.evidenceReport,
    identityReceipt: ctx.identityReceipt,
    ...(ctx.nativeOracleRef ? { nativeOracleRef: ctx.nativeOracleRef } : {}),
    noAnswerProof: ctx.noAnswerProof, proposal: ctx.proposal, usage: ctx.usage,
    stageTimings: ctx.stageTimings
  }, 'info', 'completed');
  await publishSuccess({ db: ctx.db, mission: ctx.mission, event: completed });
  return completed;
}

module.exports = { emit: emitLocalCompleted };
