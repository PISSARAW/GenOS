'use strict';

const strategyExecution = require('./strategyExecutionService');
const agentRecoveryService = require('./agentRecoveryService');
const { advanceAutonomousRound } = require('./agentRoundService');
const { scheduleWorkspaceCleanup } = require('./agentWorkspaceLifecycleService');
const { emit, updateAgent } = require('./agentOrchestrationState');
const { shouldUpdateAgentTerminalStatus } = require('./workerEvidenceBarrierLocalLifecycle');

function failureState(error) {
  const blocked = error.code === 'BUDGET_EXHAUSTED' || /budget|timeout/i.test(error.message);
  return { blocked, status: blocked ? 'blocked' : 'error',
    eventType: blocked ? 'AGENT_HALTED' : 'AGENT_FAILED',
    action: blocked ? 'BUDGET_GUARD' : 'LOCAL_MODEL' };
}

async function publish(ctx) {
  const state = failureState(ctx.error);
  const deferred = !shouldUpdateAgentTerminalStatus(ctx.mission);
  if (!deferred) await updateAgent(ctx.mission.agentId, state.status, ctx.error.message);
  const eventType = deferred ? 'LOCAL_WORKER_FAILED' : state.eventType;
  const failed = emit(ctx.mission.agentId, eventType, state.action, ctx.error.message,
    { ...failurePayload(ctx), ...await require('./workerModelRunUsage').forRun(ctx),
      ...(deferred ? { deferredTerminalEventType: state.eventType } : {}) }, 'warning', deferred ? 'running' : state.status);
  require('./agentEvidenceService').recordWorkerEvidence(ctx.mission, failed);
  ctx.reportMilestone(ctx.mission, failed);
  if (!ctx.error.terminalReceiptPublished) {
    await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, failed);
  }
  await advanceAutonomousRound(ctx.mission, failed);
  if (!state.blocked) await agentRecoveryService.queueWorkerRecovery(ctx.mission, failed);
  await scheduleWorkspaceCleanup(ctx.mission.agentId);
  return { started: false, executionRun: ctx.executionRun, local: true,
    error: ctx.error.message };
}

function failurePayload(ctx) {
  return { executionRunId: ctx.executionRun.id, model: ctx.error.model || ctx.model || ctx.mission.localModel,
    provider: ctx.error.modelProvider || ctx.provider,
    workerArtifactDiagnostics: ctx.error.workerArtifactDiagnostics, proposalTests: ctx.error.proposal?.tests,
    appliedFiles: ctx.error.proposal?.proposal?.appliedFiles, usage: ctx.error.modelUsage || ctx.usage,
    stageTimings: ctx.stageTimings };
}

module.exports = { failureState, publish, failurePayload };
