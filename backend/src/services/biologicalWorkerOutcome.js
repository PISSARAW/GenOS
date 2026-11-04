'use strict';

function failureReason(terminal) {
  const event = terminal?.event;
  const failures = ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'BUDGET_EXHAUSTED', 'AGENT_HALTED'];
  if (!failures.includes(event?.eventType)) return null;
  const candidates = [event.payload?.failureReason, event.payload?.runtimeFailure?.detail, event.detail,
    event.payload?.error, event.payload?.evidenceReport?.uncertainties?.[0]];
  return candidates.find(value => typeof value === 'string' && value.trim()) || event.eventType;
}

function result(input) {
  const { run, snapshot, guardrail, verified, terminal } = input;
  const failure = failureReason(terminal);
  return { status: run.status, completed: run.status === 'completed', verified,
    gate: 'strategy_execution_gate',
    reason: run.guardrailReason || failure || (verified ? null : guardrail) || null,
    failureReason: failure, promotionReason: guardrail || null,
    terminalEvent: snapshot.terminalEvent };
}

module.exports = { result };
