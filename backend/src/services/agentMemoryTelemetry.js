/**
 * GenOS Agent Memory Telemetry (N11)
 * Every memory failure is reported through telemetry instead of being
 * swallowed. Emitting never throws: a broken observer must not break the
 * memory path it reports on.
 */

function emitMemoryEvent(event) {
  const data = event || {};
  try {
    const telemetry = require('./telemetryObserver');
    telemetry.emitEvent({
      eventType: data.type,
      agentId: data.agentId || 'unknown',
      action: 'MEMORY',
      detail: data.detail || '',
      severity: 'warning',
      payload: data.payload || {}
    });
  } catch (_) {}
}

function memoryErrorDetail(error, context) {
  const message = error && error.message ? error.message : String(error);
  if (context) return `${context}: ${message}`;
  return message;
}

function storeFailed(agentId, error, context) {
  emitMemoryEvent({
    type: 'MEMORY_STORE_FAILED',
    agentId,
    detail: memoryErrorDetail(error, context),
    payload: { context: context || '' }
  });
}

function readFailed(agentId, error, context) {
  emitMemoryEvent({
    type: 'MEMORY_READ_FAILED',
    agentId,
    detail: memoryErrorDetail(error, context),
    payload: { context: context || '' }
  });
}

module.exports = {
  emitMemoryEvent,
  storeFailed,
  readFailed
};
