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
  if (continuity) continuity.immuneBlocked = true;
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
  if (continuity) continuity.continuationError = err.message;
}

function isEligible(input = {}) {
  const { finalVerdict, request } = input;
  const safeRequest = request || {};
  return finalVerdict === 'homeostasis_blocked' && safeRequest.continuation !== false;
}

function quarantineResult(input = {}) {
  const { orchestratorId, deviation, continuity } = input;
  telemetry.emitEvent({
    eventType: 'HOMEOSTASIS_UNSAFE_QUARANTINED',
    agentId: orchestratorId,
    action: 'WAIT_HUMAN',
    detail: 'Unsafe deviation: no autonomous continuation worker spawned.',
    payload: { missionId: orchestratorId, deviation },
    severity: 'error'
  });
  if (continuity) continuity.quarantined = true;
  return { finalVerdict: 'homeostasis_quarantined', dispatched: null, blockedByImmune: false, exhausted: false, quarantined: true };
}

function mapServiceResult(input = {}) {
  const { result, finalVerdict, continuity } = input;
  if (result.quarantined) {
    if (continuity) continuity.quarantined = true;
    return { finalVerdict: 'homeostasis_quarantined', dispatched: null, blockedByImmune: false, exhausted: false, quarantined: true };
  }
  if (result.exhausted) {
    if (continuity) continuity.budgetExhausted = true;
    return { finalVerdict: 'homeostasis_exhausted', dispatched: null, blockedByImmune: false, exhausted: true };
  }
  if (result.immuneBlocked) {
    if (continuity) continuity.immuneBlocked = true;
    return { finalVerdict, dispatched: null, blockedByImmune: true, exhausted: false };
  }
  if (result.idempotent && continuity) continuity.idempotent = true;
  return { finalVerdict: 'homeostasis_continuation', dispatched: result, blockedByImmune: false, exhausted: false };
}

function buildSafeMission(input = {}) {
  const { mission, orchestratorId } = input;
  return { ...(mission || {}), id: (mission && mission.id) || orchestratorId };
}

async function dispatchGuarded(input = {}) {
  const { db, orchestratorId, organism, evaluation, continuity, finalVerdict } = input;
  const deviation = homeostasisContinuation.classifyDeviation(evaluation);
  if (deviation === 'unsafe_action') return quarantineResult({ orchestratorId, deviation, continuity });
  const advice = homeostasisContinuation.getImmuneAdvice(organism, deviation);
  if (advice && advice.prohibitExactRetry) {
    emitImmuneBlocked(orchestratorId, deviation, continuity);
    return { finalVerdict, dispatched: null, blockedByImmune: true, exhausted: false };
  }
  const safeMission = buildSafeMission(input);
  const result = await homeostasisContinuation.dispatchHomeostasisContinuation({
    db, orchestratorId, mission: safeMission, organismState: organism, evaluation
  });
  return mapServiceResult({ result, finalVerdict, continuity });
}

async function maybeDispatchContinuation(input = {}) {
  const { finalVerdict } = input;
  if (!isEligible(input)) {
    return { finalVerdict, dispatched: null, blockedByImmune: false, exhausted: false };
  }
  try {
    return await dispatchGuarded(input);
  } catch (continuityErr) {
    emitContinuationFailed(input.orchestratorId, continuityErr, input.continuity);
    return { finalVerdict, dispatched: null, blockedByImmune: false, exhausted: false };
  }
}

module.exports = { maybeDispatchContinuation };
