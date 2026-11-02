'use strict';

const { createHash } = require('node:crypto');
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,159}$/;
const EVENTS = Object.freeze({
  AGENT_FAILED: 'nociception', AGENT_RUNTIME_ERROR: 'nociception',
  TOOL_CALL_FAILED: 'nociception', TOKEN_ROUND_FAILED: 'interoception',
  TOKEN_ROUND_EVALUATED: 'interoception', NERVOUS_RESOURCE_SAMPLE: 'interoception',
  NERVOUS_SENSOR_SAMPLE: 'interoception', EVIDENCE_REPORT: 'epistemic',
  AGENT_COMPLETED: 'proprioception', TOOL_CALL_COMPLETED: 'proprioception',
  TOPOLOGY_TRANSITION_COMPLETED: 'proprioception'
});
const SEVERITIES = new Set(['info', 'warn', 'warning', 'error', 'critical']);

function identifier(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}

function scopeOf(input) {
  return Object.freeze({
    organizationId: identifier(input?.organizationId, 'organizationId'),
    projectId: identifier(input?.projectId, 'projectId')
  });
}

function scopeKey(input) {
  const scope = scopeOf(input);
  return JSON.stringify([scope.organizationId, scope.projectId]);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unit(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError('Expected a finite number in [0, 1]');
  }
  return value;
}

function checkPayloadScope(payload, scope) {
  const org = payload.organizationId ?? payload.organization_id;
  const project = payload.projectId ?? payload.project_id;
  if (org !== undefined && org !== scope.organizationId) throw new Error('SCOPE_MISMATCH');
  if (project !== undefined && project !== scope.projectId) throw new Error('SCOPE_MISMATCH');
}

function correlation(payload) {
  const value = payload.traceId;
  if (typeof value !== 'string' || value.length > 160) return null;
  if (/^[a-f0-9]{32}$/.test(value) && !/^0+$/.test(value)) return { traceId: value };
  return { legacyCorrelationHash: digest(value) };
}

function observation(event, context) {
  if (!Object.hasOwn(EVENTS, event?.eventType)) return null;
  const channel = EVENTS[event.eventType];
  const scope = scopeOf(context.scope);
  const now = context.now;
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Invalid trusted clock');
  const payload = event.payload || {};
  checkPayloadScope(payload, scope);
  const eventId = identifier(event.id, 'eventId');
  const observedAt = Date.parse(event.timestamp);
  if (!Number.isFinite(observedAt) || observedAt < 0 || observedAt > now + 60000) {
    throw new TypeError('Invalid observation timestamp');
  }
  const outcome = payload.evidenceReport?.outcome;
  return Object.freeze({
    schemaVersion: 1, id: digest([scopeKey(scope), eventId]), eventId, scope,
    agentId: identifier(event.agentId, 'agentId'), kind: event.eventType, channel,
    observedAt, receivedAt: now,
    severity: SEVERITIES.has(event.severity) ? event.severity : 'info',
    pressure: unit(payload.resourcePressure), coverage: unit(payload.observabilityCoverage),
    reportedOutcome: ['success', 'failure', 'unverified'].includes(outcome) ? outcome : null,
    correlation: correlation(payload)
  });
}

function fingerprint(signal) {
  const { receivedAt, ...stable } = signal;
  return digest(stable);
}

module.exports = { EVENTS, identifier, scopeOf, scopeKey, digest, unit, observation, fingerprint };
