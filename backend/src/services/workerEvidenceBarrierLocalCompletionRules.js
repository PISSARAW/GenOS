'use strict';

function emitLocalCompleted(context) {
  return context.emit(context.ctx.mission.agentId, context.eventType, context.ctx.kind, context.ctx.detail, {
    executionRunId: context.ctx.executionRun.id, model: context.ctx.model, provider: context.ctx.provider,
    evidenceReport: context.ctx.evidenceReport,
    identityReceipt: context.ctx.identityReceipt,
    snapshot: context.ctx.replaySnapshotPath || context.ctx.mission.runtimeCapsule?.snapshotPath,
    ...(context.ctx.nativeOracleRef ? { nativeOracleRef: context.ctx.nativeOracleRef } : {}),
    noAnswerProof: context.ctx.noAnswerProof, proposal: context.ctx.proposal, usage: context.ctx.usage,
    stageTimings: context.ctx.stageTimings,
    ...(context.deferred ? { deferredTerminalEventType: context.ctx.eventType } : {})
  }, context.ctx.unresolved ? 'warning' : 'info', context.deferred ? 'running' : context.terminalStatus);
}

module.exports = { emitLocalCompleted };
