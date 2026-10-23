'use strict';

const { emit, updateAgent } = require('./agentOrchestrationState');

async function emitLocalCompleted(ctx, publishSuccess) {
  const terminalStatus = ctx.unresolved ? 'unverified' : 'completed';
  await updateAgent(ctx.mission.agentId, terminalStatus, ctx.statusText);
  if (!ctx.unresolved) emit(ctx.mission.agentId, 'EVIDENCE_REPORT', 'VALIDATE_EVIDENCE',
    'Validated local worker evidence report.', {
      executionRunId: ctx.executionRun.id, evidenceReport: ctx.evidenceReport,
      nativeOracleRef: ctx.nativeOracleRef, identityReceipt: ctx.identityReceipt
    }, 'info', 'completed');
  const completed = emit(ctx.mission.agentId, ctx.eventType, ctx.kind, ctx.detail, {
    executionRunId: ctx.executionRun.id, model: ctx.model, provider: ctx.provider,
    evidenceReport: ctx.evidenceReport,
    identityReceipt: ctx.identityReceipt,
    snapshot: ctx.replaySnapshotPath || ctx.mission.runtimeCapsule?.snapshotPath,
    ...(ctx.nativeOracleRef ? { nativeOracleRef: ctx.nativeOracleRef } : {}),
    noAnswerProof: ctx.noAnswerProof, proposal: ctx.proposal, usage: ctx.usage,
    stageTimings: ctx.stageTimings
  }, ctx.unresolved ? 'warning' : 'info', terminalStatus);
  await publishSuccess({ db: ctx.db, mission: ctx.mission, event: completed });
  return completed;
}

module.exports = { emit: emitLocalCompleted };

function terminalMetadata(evidence, codeWorker) {
  if (evidence.unresolved) return { eventType: 'AGENT_FAILED', kind: 'EVIDENCE_GAP',
    detail: 'Local worker reported that the supplied evidence cannot substantiate the requested outcome.',
    statusText: 'Unresolved: insufficient evidence' };
  if (evidence.noAnswer) return { eventType: 'WORKER_NO_ANSWER_PROVEN', kind: 'REPORT_NO_ANSWER',
    detail: 'Local worker returned an evidence-backed proof that no answer exists in the stated scope.',
    statusText: 'No answer proven' };
  if (codeWorker) return { eventType: 'AGENT_COMPLETED', kind: 'LOCAL_CODE_PROPOSAL',
    detail: 'Local worker produced a non-merged capsule diff and test evidence.',
    statusText: 'Local review completed' };
  return { eventType: 'AGENT_COMPLETED', kind: 'LOCAL_REVIEW',
    detail: 'Local-model worker completed its evidence review.', statusText: 'Local review completed' };
}

async function complete(ctx, publishSuccess) {
  const nativeOracleRef = ctx.evidence.unresolved ? null
    : await require('./workerCodeOracleLocal').prepare({ db: ctx.db, mission: ctx.mission,
      executionRun: ctx.executionRun, evidenceReport: ctx.evidence.evidenceReport });
  const replaySnapshot = ctx.evidence.unresolved ? null
    : await require('./workerEvidenceReplaySnapshot').createReplaySnapshot({
      workerId: ctx.mission.agentId, runId: ctx.executionRun.id,
      workspaceRoot: ctx.mission.workspaceRoot,
      sourceSnapshot: ctx.mission.runtimeCapsule?.snapshotPath,
      worldId: ctx.mission.runtimeCapsule?.worldId,
      evidenceReport: ctx.evidence.evidenceReport
    });
  await require('./identity/worker').finish(ctx.db, { identity: ctx.identity,
    success: !ctx.evidence.unresolved, evidenceRef: {
      executionRunId: ctx.executionRun.id, nativeOracleRef: nativeOracleRef || null,
      reportHash: require('./identity/storage').hash(ctx.evidence.evidenceReport),
      verification: 'runtime_evidence_barrier' } });
  const terminal = terminalMetadata(ctx.evidence, ctx.generation.codeWorker);
  await emitLocalCompleted({ ...ctx, ...terminal, nativeOracleRef,
    replaySnapshotPath: replaySnapshot?.snapshotPath,
    evidenceReport: ctx.evidence.evidenceReport, identityReceipt: ctx.identity.receipt,
    noAnswerProof: ctx.evidence.noAnswer ? ctx.evidence.proof : undefined,
    proposal: ctx.evidence.proposal, unresolved: ctx.evidence.unresolved,
    model: ctx.generation.result.model, provider: ctx.generation.result.provider,
    usage: { input_tokens: ctx.generation.result.inputTokens,
      output_tokens: ctx.generation.result.outputTokens, cost_usd: ctx.generation.result.costUsd,
      tokens: ctx.evidence.consumed } }, publishSuccess);
  return { started: true, unresolved: ctx.evidence.unresolved, executionRun: ctx.executionRun,
    local: true, result: ctx.generation.result };
}

module.exports.complete = complete;
