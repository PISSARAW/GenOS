'use strict';

const RESOLVED_STATUSES = new Set(['attached', 'empty', 'omitted_budget', 'disabled']);

function createMemoryContext(status, text = '', reason = null) {
  if (!RESOLVED_STATUSES.has(status)) throw new Error(`Unknown memory context status '${status}'.`);
  const value = status === 'attached' ? String(text || '') : '';
  return {
    status,
    text: value,
    estimatedTokens: Math.ceil(Buffer.byteLength(value, 'utf8') / 4),
    ...(reason ? { reason } : {})
  };
}

function isResolved(mission) {
  const status = mission?.memoryContext?.status;
  if (RESOLVED_STATUSES.has(status)) return true;
  if (mission?.memoryContextAttached === true) return true;
  return mission?.memoryContextAttached === false
    && mission?.memoryContextDegradation === 'optional_memory_exceeds_context_budget';
}

function textForMission(mission) {
  return mission?.memoryContext?.status === 'attached'
    ? String(mission.memoryContext.text || '') : '';
}

module.exports = { createMemoryContext, isResolved, textForMission };
