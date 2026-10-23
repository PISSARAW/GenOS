'use strict';

const { updateAgent } = require('./agentOrchestrationState');
const completionContract = require('./missionCompletionContract');

const TERMINAL_EVENTS = new Set([
  'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'AGENT_HALTED',
  'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'MISSION_NO_ANSWER_PROVEN'
]);

function isTerminalEvent(eventType) {
  return TERMINAL_EVENTS.has(eventType);
}

function lifecycleState(status, eventType) {
  if (['accepted', 'running', 'idle', 'in_progress'].includes(status)) return 'running';
  if (eventType === 'AGENT_COMPLETED'
      || ['completed', 'partial', 'unverified'].includes(status)) return 'completed';
  if (eventType === 'AGENT_HALTED' || ['blocked', 'terminated'].includes(status)) return 'interrupted';
  return 'failed';
}

function domainValidation(state) {
  const domain = state?.missionDomainState;
  if (domain?.hasDomainFailure) return { status: 'failed', reasons: ['agent_domain_failed'] };
  if (domain?.unverified === false) return { status: 'verified', reasons: [] };
  return { status: 'partial', reasons: ['required_results_unverified'] };
}

function eventValidation(status, state) {
  if (['partial', 'unverified'].includes(status) && domainValidation(state).status === 'partial') {
    return { status: 'partial', reasons: ['required_results_unverified'] };
  }
  return domainValidation(state);
}

function evaluateTerminalStatus(ctx, event, nextStatus) {
  const supplied = event.payload?.completionInput || event.completionInput || {};
  const status = nextStatus || event.status;
  return completionContract.evaluate({ ...supplied,
    lifecycleState: lifecycleState(status, event.eventType),
    barrierStatus: supplied.barrierStatus ?? 'complete',
    topologyValidation: supplied.topologyValidation || eventValidation(status, ctx.state) });
}

function persistedStatus(verdict, fallback) {
  if (verdict === 'succeeded') return 'completed';
  if (verdict === 'failed') return 'error';
  if (verdict === 'interrupted') return fallback === 'blocked' ? 'blocked' : 'terminated';
  if (verdict === 'in_progress') return 'running';
  return 'unverified';
}

function queue(ctx, event, nextStatus) {
  if (!(nextStatus || event.currentTask)) return;
  if (event.eventType === 'AGENT_COMPLETED' && !event.status) return;
  if (!nextStatus && !isTerminalEvent(event.eventType)) {
    ctx.state.executionQueue = ctx.state.executionQueue.then(() => updateAgent(ctx.agentId,
      null, event.currentTask));
    return null;
  }
  const completion = evaluateTerminalStatus(ctx, event, nextStatus);
  const status = persistedStatus(completion.verdict, nextStatus);
  if (isTerminalEvent(event.eventType)) {
    ctx.state.pendingTerminalStatuses.set(event.trackedEventId, {
      nextStatus: status, currentTask: event.currentTask, completion
    });
    return completion;
  }
  ctx.state.executionQueue = ctx.state.executionQueue.then(() => updateAgent(ctx.agentId,
    status, event.currentTask));
  return completion;
}

async function settle(input) {
  const { ctx, event } = input;
  const pending = ctx.state.pendingTerminalStatuses.get(event.id);
  if (!pending) return;
  ctx.state.pendingTerminalStatuses.delete(event.id);
  const flush = ctx.flushTelemetry || ((timeoutMs) => require('./telemetryObserver').flush(timeoutMs));
  const updater = ctx.updateAgent || updateAgent;
  try {
    const result = await flush(5000);
    if (!result?.flushed) throw new Error(`Terminal telemetry still has ${result?.pending ?? 'unknown'} pending event(s).`);
    await updater(ctx.agentId, pending.nextStatus, pending.currentTask);
  } catch (error) {
    await updater(ctx.agentId, 'error', `Terminal evidence persistence failed: ${error.message}`).catch(() => {});
    require('./orchestratorEventFailure').record(ctx, event, error);
  }
}

module.exports = { isTerminalEvent, evaluateTerminalStatus, persistedStatus, eventValidation, queue, settle };
