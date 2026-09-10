/**
 * Telemetry event contract — server-imposed timestamp and event-type validation.
 *
 * Client timestamps are untrusted: only values within ±60s of the server clock
 * are kept (clock-skew tolerance); anything else is overwritten by server time.
 * Event types must match ^[A-Z][A-Z0-9_]{2,64}$ — the whole backend emits
 * UPPER_SNAKE identifiers, anything else is rejected.
 */

const EVENT_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{2,64}$/;
const DEFAULT_EVENT_TYPE = 'AGENT_EVENT';
const CLIENT_TIMESTAMP_TOLERANCE_MS = 60 * 1000;

function invalidEvent(message) {
  return Object.assign(new Error(message), { code: 'INVALID_TELEMETRY_EVENT' });
}

function asRecord(value) {
  if (value && typeof value === 'object') return value;
  return {};
}

function firstPresent(values) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

function resolveEventType(raw) {
  const candidate = raw == null ? DEFAULT_EVENT_TYPE : String(raw);
  if (!EVENT_TYPE_PATTERN.test(candidate)) throw invalidEvent(`Rejected telemetry eventType '${candidate}'.`);
  return candidate;
}

function parseTimestamp(raw) {
  if (raw == null) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

function resolveTimestamp(raw) {
  const now = Date.now();
  const client = parseTimestamp(raw);
  if (client === null) return new Date(now).toISOString();
  if (Math.abs(now - client) > CLIENT_TIMESTAMP_TOLERANCE_MS) return new Date(now).toISOString();
  return new Date(client).toISOString();
}

function resolveScope(source, payload) {
  const tenant = asRecord(payload.tenant);
  return {
    organizationId: firstPresent([payload.organizationId, payload.organization_id, tenant.organizationId, tenant.organization_id, source.organizationId, source.organization_id]),
    projectId: firstPresent([payload.projectId, payload.project_id, tenant.projectId, tenant.project_id, source.projectId, source.project_id])
  };
}

function applyTrace(payload, scope, trace) {
  if (scope.organizationId) payload.organizationId = scope.organizationId;
  if (scope.projectId) payload.projectId = scope.projectId;
  if (trace.traceId && !payload.traceId) payload.traceId = trace.traceId;
  if (trace.reqId && !payload.requestId) payload.requestId = trace.reqId;
  return payload;
}

function resolveSessionId(source, payload) {
  return firstPresent([source.sessionId, payload.sessionId, payload.executionRunId, payload.runId]) || `agent-session-${source.agentId || 'system'}`;
}

function resolveDetail(source) {
  return firstPresent([source.detail, source.message]) || '';
}

function readTraceContext(asyncLocalStorage) {
  const store = asyncLocalStorage.getStore();
  const traceId = store ? store.get('traceId') : null;
  const reqId = store ? store.get('requestId') : null;
  return { traceId, reqId };
}

function buildEvent(eventData, payload, trace) {
  const source = asRecord(eventData);
  const scope = resolveScope(source, payload);
  const enriched = applyTrace(payload, scope, trace || {});
  return {
    id: source.id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sessionId: resolveSessionId(source, enriched),
    timestamp: resolveTimestamp(source.timestamp),
    eventType: resolveEventType(source.eventType),
    agentId: source.agentId || 'system',
    action: source.action || 'EXECUTE',
    detail: resolveDetail(source),
    severity: source.severity || 'info',
    status: source.status || 'SUCCESS',
    payload: enriched
  };
}

module.exports = {
  EVENT_TYPE_PATTERN,
  CLIENT_TIMESTAMP_TOLERANCE_MS,
  resolveEventType,
  resolveTimestamp,
  resolveScope,
  readTraceContext,
  buildEvent
};
