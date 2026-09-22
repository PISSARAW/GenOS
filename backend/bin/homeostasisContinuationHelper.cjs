'use strict';

const telemetry = require('../src/services/telemetryObserver');
const homeostasisContinuation = require('../src/services/homeostasisContinuationService');

async function maybeDispatchContinuation(input = {}) {
  const { db, orchestratorId, task, request, mission, completionGate, evaluation, organism, finalVerdict, continuity } = input;
  if (finalVerdict !== 'homeostasis_blocked' || request.continuation === false) {
    return { finalVerdict, dispatched: null, blockedByImmune: false };
  }
  try {
    const deviation = homeostasisContinuation.classifyDeviation(evaluation);
    const advice = homeostasisContinuation.getImmuneAdvice(organism, deviation);
    if (advice && advice.prohibitExactRetry) {
      telemetry.emitEvent({
        eventType: 'HOMEOSTASIS_CONTINUATION_IMMUNE_BLOCKED',
        agentId: orchestratorId,
        action: 'IMMUNE_REFUSAL',
        detail: `Exact retry prohibited by immune memory for deviation: ${deviation}`,
        payload: { missionId: orchestratorId, deviation, strategy: 'homeostasis_continuation' },
        severity: 'warning'
      });
      continuity.immuneBlocked = true;
      return { finalVerdict, dispatched: null, blockedByImmune: true };
    }
    const result = await homeostasisContinuation.dispatchHomeostasisContinuation({
      db,
      orchestratorId,
      mission,
      organismState: organism,
      evaluation
    });
    return { finalVerdict: 'homeostasis_continuation', dispatched: result, blockedByImmune: false };
  } catch (continuityErr) {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_FAILED',
      agentId: orchestratorId,
      action: 'CONTINUATION_FAILED',
      detail: continuityErr.message,
      payload: { missionId: orchestratorId },
      severity: 'error'
    });
    continuity.continuationError = continuityErr.message;
    return { finalVerdict, dispatched: null, blockedByImmune: false };
  }
}

module.exports = { maybeDispatchContinuation };
