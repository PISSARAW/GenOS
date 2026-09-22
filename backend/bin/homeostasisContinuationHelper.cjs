'use strict';

const telemetry = require('../src/services/telemetryObserver');
const homeostasisContinuation = require('../src/services/homeostasisContinuationService');

async function maybeDispatchContinuation(input = {}) {
  const { db, orchestratorId, task, request, mission, completionGate, evaluation, organism, finalVerdict, continuity } = input;
  if (finalVerdict !== 'homeostasis_blocked' || request.continuation === false) {
    return { finalVerdict, dispatched: null };
  }
  try {
    const result = await homeostasisContinuation.dispatchHomeostasisContinuation({
      db,
      orchestratorId,
      mission,
      organismState: organism,
      evaluation
    });
    return { finalVerdict: 'homeostasis_continuation', dispatched: result };
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
    return { finalVerdict, dispatched: null };
  }
}

module.exports = { maybeDispatchContinuation };
