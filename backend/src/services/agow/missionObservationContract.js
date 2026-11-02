'use strict';

const { digest } = require('../evidenceProtocol/canonical');

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function eventContent(event) {
  return { eventType: event.eventType, payload: event.payload || {},
    action: event.action ?? null, detail: event.detail ?? null, status: event.status ?? null };
}

function eventIdentity(event, binding) {
  if (!require('../agentTerminalStatusService').isTerminalEvent(event.eventType)) {
    throw new Error('agow-mission-terminal-event-required');
  }
  const payload = event.payload || {};
  const identities = [[event.runId, binding.runId], [payload.runId, binding.runId], [payload.executionRunId, binding.runId],
    [payload.missionId, binding.missionId], [event.agentId, binding.agentId]];
  if (identities.some(([actual, expected]) => actual != null && actual !== expected)) {
    throw new Error('agow-mission-event-identity-mismatch');
  }
  if (!identifier(event.eventType)) throw new Error('agow-mission-event-type-required');
  const eventDigest = digest(eventContent(event));
  const eventId = event.eventId ?? event.id ?? eventDigest;
  if (!identifier(eventId)) throw new Error('agow-mission-event-id-invalid');
  return { eventId, eventDigest, eventType: event.eventType };
}

function finiteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function validateMetrics(metrics) {
  if (!metrics || !finiteNonnegative(metrics.realizedLoss)) throw new Error('agow-mission-loss-invalid');
  const unitFields = ['goalProgress', 'resourceReserve', 'missionStability'];
  if (!unitFields.every((key) => metrics[key] === null || (finiteNonnegative(metrics[key]) && metrics[key] <= 1))) {
    throw new Error('agow-mission-unit-metric-invalid');
  }
  const counts = ['blockageEvents', 'viabilityViolations'];
  if (!counts.every((key) => metrics[key] === null || (Number.isSafeInteger(metrics[key]) && metrics[key] >= 0))) {
    throw new Error('agow-mission-count-invalid');
  }
  return Object.fromEntries(['realizedLoss', ...unitFields, ...counts].map((key) => [key, metrics[key]]));
}

function measurement(result, context) {
  if (result?.verified !== true || !identifier(result.verifierId)) throw new Error('agow-mission-not-verified');
  if (result.bindingHash !== context.binding.bindingHash || result.eventDigest !== context.eventIdentity.eventDigest) {
    throw new Error('agow-mission-verification-identity-mismatch');
  }
  if (!Array.isArray(result.evidenceRefs) || !result.evidenceRefs.length
    || !result.evidenceRefs.every(identifier)) throw new Error('agow-mission-evidence-required');
  return { verifierId: result.verifierId, bindingHash: result.bindingHash, eventDigest: result.eventDigest,
    evidenceRefs: [...new Set(result.evidenceRefs)], metrics: validateMetrics(result.metrics) };
}

module.exports = { identifier, eventContent, eventIdentity, measurement };
