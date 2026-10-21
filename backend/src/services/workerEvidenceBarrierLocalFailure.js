'use strict';

const strategyExecution = require('./strategyExecutionService');
const agentRecoveryService = require('./agentRecoveryService');
const { advanceAutonomousRound } = require('./agentRoundService');
const { scheduleWorkspaceCleanup } = require('./agentWorkspaceLifecycleService');
const { emit, updateAgent } = require('./agentOrchestrationState');

function failureState(error) {
  const blocked = error.code === 'BUDGET_EXHAUSTED' || /budget|timeout/i.test(error.message);
  return { blocked, status: blocked ? 'blocked' : 'error',
    eventType: blocked ? 'AGENT_HALTED' : 'AGENT_FAILED',
    action: blocked ? 'BUDGET_GUARD' : 'LOCAL_MODEL' };
}

async function publish(ctx) {
  const state = failureState(ctx.error);
  await updateAgent(ctx.mission.agentId, state.status, ctx.error.message);
  const failed = emit(ctx.mission.agentId, state.eventType, state.action, ctx.error.message,
    { executionRunId: ctx.executionRun.id, model: ctx.mission.localModel,
      workerArtifactDiagnostics: ctx.error.workerArtifactDiagnostics,
      proposalTests: ctx.error.proposal?.tests, usage: ctx.usage,
      stageTimings: ctx.stageTimings }, 'warning', state.status);
  require('./agentEvidenceService').recordWorkerEvidence(ctx.mission, failed);
  ctx.reportMilestone(ctx.mission, failed);
  if (!ctx.error.terminalReceiptPublished) {
    await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, failed);
  }
  await advanceAutonomousRound(ctx.mission, failed);
  if (!state.blocked) agentRecoveryService.queueWorkerRecovery(ctx.mission, failed);
  await scheduleWorkspaceCleanup(ctx.mission.agentId);
  return { started: false, executionRun: ctx.executionRun, local: true,
    error: ctx.error.message };
}

module.exports = { failureState, publish };
