'use strict';

const telemetry = require('../src/services/telemetryObserver');
const homeostasisContinuation = require('../src/services/homeostasisContinuationService');

function emitImmuneBlocked(orchestratorId, deviation, continuity) {
  telemetry.emitEvent({
    eventType: 'HOMEOSTASIS_CONTINUATION_IMMUNE_BLOCKED',
    agentId: orchestratorId,
    action: 'IMMUNE_REFUSAL',
    detail: `Exact retry prohibited by immune memory for deviation: ${deviation}`,
    payload: { missionId: orchestratorId, deviation, strategy: 'homeostasis_continuation' },
    severity: 'warning'
  });
  if (!continuity) continuity = {};
  continuity.immuneBlocked = true;
}

function emitContinuationFailed(orchestratorId, err, continuity) {
  telemetry.emitEvent({
    eventType: 'HOMEOSTASIS_CONTINUATION_FAILED',
    agentId: orchestratorId,
    action: 'CONTINUATION_FAILED',
    detail: err.message,
    payload: { missionId: orchestratorId },
    severity: 'error'
  });
  if (!continuity) continuity = {};
  continuity.continuationError = err.message;
}

async function maybeDispatchContinuation(input = {}) {
  const { db, orchestratorId, task, request, mission, completionGate, evaluation, organism, finalVerdict, continuity } = input;
  if (finalVerdict !== 'homeostasis_blocked' || request.continuation === false) {
    return { finalVerdict, dispatched: null, blockedByImmune: false, exhausted: false };
  }
  try {
    const deviation = homeostasisContinuation.classifyDeviation(evaluation);
    const advice = homeostasisContinuation.getImmuneAdvice(organism, deviation);
    if (advice && advice.prohibitExactRetry) {
      emitImmuneBlocked(orchestratorId, deviation, continuity);
      return { finalVerdict, dispatched: null, blockedByImmune: true, exhausted: false };
    }
    const result = await homeostasisContinuation.dispatchHomeostasisContinuation({
      db, orchestratorId, mission, organismState: organism, evaluation
    });
    if (result.exhausted) {
      if (!continuity) continuity = {};
      continuity.budgetExhausted = true;
      return { finalVerdict: 'homeostasis_exhausted', dispatched: null, blockedByImmune: false, exhausted: true };
    }
    if (result.immuneBlocked) {
      if (!continuity) continuity = {};
      continuity.immuneBlocked = true;
      return { finalVerdict, dispatched: null, blockedByImmune: true, exhausted: false };
    }
    return { finalVerdict: 'homeostasis_continuation', dispatched: result, blockedByImmune: false, exhausted: false };
  } catch (continuityErr) {
    emitContinuationFailed(orchestratorId, continuityErr, continuity);
    return { finalVerdict, dispatched: null, blockedByImmune: false, exhausted: false };
  }
}

module.exports = { maybeDispatchContinuation };
