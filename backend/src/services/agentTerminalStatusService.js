'use strict';

const { updateAgent } = require('./agentOrchestrationState');

const TERMINAL_EVENTS = new Set([
  'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'AGENT_HALTED',
  'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'MISSION_NO_ANSWER_PROVEN'
]);

function isTerminalEvent(eventType) {
  return TERMINAL_EVENTS.has(eventType);
}

function queue(ctx, event, nextStatus) {
  if (!(nextStatus || event.currentTask)) return;
  if (event.eventType === 'AGENT_COMPLETED' && !event.status) return;
  if (isTerminalEvent(event.eventType)) {
    ctx.state.pendingTerminalStatuses.set(event.trackedEventId, {
      nextStatus, currentTask: event.currentTask
    });
    return;
  }
  ctx.state.executionQueue = ctx.state.executionQueue.then(() => updateAgent(ctx.agentId,
    nextStatus, event.currentTask));
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

module.exports = { isTerminalEvent, queue, settle };
