'use strict';

const attemptLedger = require('./modelAttemptLedger');
const reservations = require('./modelBudgetReservationService');
const routingPolicy = require('./modelRoutingPolicy');
const telemetry = require('./telemetryObserver');

function isInterrupted(error) {
  return error?.code === 'MODEL_ROUTE_ABORTED'
    || error?.code === 'MODEL_ROUTE_DEADLINE_EXCEEDED';
}

function measuredUsage(value) {
  const usage = attemptLedger.usageFrom(value);
  return usage.tokenUsageSource === 'provider' ? usage : null;
}

function costOf(outcome, usage) {
  const registered = outcome.prepared?.registered || {};
  return routingPolicy.estimateCostUsd({
    costInput: Number(registered.cost_input || 0),
    costOutput: Number(registered.cost_output || 0)
  }, usage.inputTokens, usage.outputTokens);
}

function report(outcome, code, message) {
  telemetry.emitEvent({ eventType: 'MODEL_LATE_RECEIPT',
    agentId: 'model-router', action: code, severity: 'warning',
    detail: message, payload: { attemptId: outcome.id, model: outcome.uri } });
}

async function reconcile(ctx, outcome, value) {
  const usage = measuredUsage(value);
  if (!usage) {
    report(outcome, 'UNMEASURED', 'Late provider result has no measured usage; reservation remains uncertain.');
    return;
  }
  const costUsd = costOf(outcome, usage);
  await attemptLedger.reconcileLateAttempt(ctx.db, { id: outcome.id,
    ...usage, costUsd });
  await attemptLedger.recordModelUsage(ctx.db, {
    organizationId: ctx.organizationId, projectId: ctx.projectId,
    executionRunId: ctx.executionRunId, agentId: ctx.agentId
  }, { ...usage, tokenUsageMeasured: true, model: outcome.uri,
    routeAttemptId: outcome.id, costUsd, attemptStatus: 'late_receipt',
    success: false });
  const settlement = await reservations.settle(ctx.db, outcome.reservation, {
    providerCalled: true, costUsd,
    tokens: usage.inputTokens + usage.outputTokens
  });
  ctx.spent = (ctx.spent || 0) + costUsd;
  if (settlement.overBudget) report(outcome, 'OVER_BUDGET',
    'Late measured usage exceeded the shared model budget.');
}

function observe({ ctx, outcome, error, settlement }) {
  if (!isInterrupted(error) || settlement.status !== 'uncertain'
    || !outcome.providerPromise) return;
  outcome.providerPromise.then(
    (result) => reconcile(ctx, outcome, result),
    (failure) => reconcile(ctx, outcome, failure?.usage || failure)
  ).catch((failure) => report(outcome, 'RECONCILE_FAILED', failure.message));
}

module.exports = { observe };
