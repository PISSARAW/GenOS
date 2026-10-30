'use strict';

function emitLocalCompletedValue1(__genosValueScope1) {
  return (0, __genosValueScope1.emit)(__genosValueScope1.ctx.mission.agentId, __genosValueScope1.eventType, __genosValueScope1.ctx.kind, __genosValueScope1.ctx.detail, {
    executionRunId: __genosValueScope1.ctx.executionRun.id, model: __genosValueScope1.ctx.model, provider: __genosValueScope1.ctx.provider,
    evidenceReport: __genosValueScope1.ctx.evidenceReport,
    identityReceipt: __genosValueScope1.ctx.identityReceipt,
    snapshot: __genosValueScope1.ctx.replaySnapshotPath || __genosValueScope1.ctx.mission.runtimeCapsule?.snapshotPath,
    ...(__genosValueScope1.ctx.nativeOracleRef ? { nativeOracleRef: __genosValueScope1.ctx.nativeOracleRef } : {}),
    noAnswerProof: __genosValueScope1.ctx.noAnswerProof, proposal: __genosValueScope1.ctx.proposal, usage: __genosValueScope1.ctx.usage,
    stageTimings: __genosValueScope1.ctx.stageTimings,
    ...(__genosValueScope1.deferred ? { deferredTerminalEventType: __genosValueScope1.ctx.eventType } : {})
  }, __genosValueScope1.ctx.unresolved ? 'warning' : 'info', __genosValueScope1.deferred ? 'running' : __genosValueScope1.terminalStatus);
}

module.exports = { emitLocalCompletedValue1 };
