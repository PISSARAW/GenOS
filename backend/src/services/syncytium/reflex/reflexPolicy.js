'use strict';

const SIGNAL_TYPES = new Set(['STOP', 'SECURITY_CRITICAL', 'STATE_INVALID', 'RESOURCE_EXHAUSTED']);

function normalize(signal, sessionId) {
  const type = String(signal?.type || '').toUpperCase();
  if (!SIGNAL_TYPES.has(type)) throw reflexError('SYNCYTIUM_REFLEX_SIGNAL_INVALID', `Unsupported reflex signal '${type}'.`);
  if (!signal.signalId || typeof signal.signalId !== 'string') throw reflexError('SYNCYTIUM_REFLEX_SIGNAL_INVALID', 'Reflex signal requires signalId.');
  return {
    signalId: signal.signalId,
    sessionId,
    type,
    actorId: String(signal.actorId || 'system'),
    sourceOpId: signal.sourceOpId || null,
    timestampMs: signal.timestampMs ?? Date.now(),
    urgency: 'IMMEDIATE',
    metadata: compactMetadata(signal.metadata)
  };
}

function compactMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 12)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [key.slice(0, 80), typeof value === 'string' ? value.slice(0, 256) : value]));
}

function reflexError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { normalize, SIGNAL_TYPES };
