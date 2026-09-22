/**
 * Signal Coalescer — anti-spam & refractory period enforcement
 *
 * Biological systems avoid signal storms through:
 *   - Refractory periods: after emitting, an agent cannot emit again for N ms
 *   - Coalescing: rapid updates about the same topic are aggregated
 *   - Threshold crossing: only emit when a value crosses a boundary
 *
 * Cette couche est entre les signaux bruts et l'event bus / dispatch récepteur.
 *
 * Corrections P2 :
 *   - Le premier signal est maintenant bufferisé
 *   - shouldCoalesce enregistre le signal dans le buffer avant de décider
 */

const crypto = require('crypto');

// Per-sender refractory tracking: senderId → { lastEmitAt, lastTopic }
const refractoryLog = new Map();

// Per-topic coalescing buffer: topic → { signals[], timer, lastEmitAt }
const coalescingBuffer = new Map();

const DEFAULT_REFRACTORY_MS = 2000;
const DEFAULT_COALESCE_MS = 500;

function hashTopic(topic) {
  return crypto.createHash('sha256').update(topic || '').digest('hex').slice(0, 8);
}

function buildRefractoryKey(senderId, topic) {
  return `${senderId || 'system'}:${topic || 'default'}`;
}

function checkRefractory(senderId, topic, opts = {}) {
  const now = opts.now || Date.now();
  const refractoryMs = opts.refractoryMs || DEFAULT_REFRACTORY_MS;
  const key = buildRefractoryKey(senderId, topic);
  const last = refractoryLog.get(key);
  if (!last) return { allowed: true, remaining: 0 };
  const elapsed = now - last.lastEmitAt;
  return {
    allowed: elapsed >= refractoryMs,
    remaining: Math.max(0, refractoryMs - elapsed),
    lastEmitAt: last.lastEmitAt,
  };
}

function recordEmission(senderId, topic, opts = {}) {
  const now = opts.now || Date.now();
  const key = buildRefractoryKey(senderId, topic);
  refractoryLog.set(key, { lastEmitAt: now, topic });
  // Cleanup old entries (> 60s)
  const cutoff = now - 60_000;
  for (const [k, v] of refractoryLog) {
    if (v.lastEmitAt < cutoff) refractoryLog.delete(k);
  }
}

function shouldCoalesce(signal, topic, opts = {}) {
  const now = opts.now || Date.now();
  const coalesceMs = opts.coalesceMs || DEFAULT_COALESCE_MS;
  const buf = coalescingBuffer.get(topic);
  if (!buf) {
    // First signal for this topic — buffer it, don't emit yet
    bufferSignal(signal, topic);
    return { shouldEmit: false, aggregated: [signal] };
  }

  buf.signals.push(signal);
  buf.lastEmitAt = now;

  const age = now - buf.firstEmitAt;
  if (age >= coalesceMs) {
    coalescingBuffer.delete(topic);
    return { shouldEmit: true, aggregated: buf.signals };
  }

  return { shouldEmit: false, aggregated: buf.signals };
}

function bufferSignal(signal, topic) {
  coalescingBuffer.set(topic, {
    signals: [signal],
    firstEmitAt: Date.now(),
    lastEmitAt: Date.now(),
  });
}

function flushBufferedTopic(topic) {
  const buf = coalescingBuffer.get(topic);
  if (!buf) return [];
  coalescingBuffer.delete(topic);
  return buf.signals;
}

/**
 * Filter a signal through coalescing + refractory checks.
 * Returns null if signal should be suppressed.
 */
function coalesce(signal, opts = {}) {
  const now = opts.now || Date.now();
  const topic = signal.topic || 'default';
  const senderId = signal.senderAgentId;

  // 1. Check refractory period
  const refractory = checkRefractory(senderId, topic, { now, refractoryMs: opts.refractoryMs });
  if (!refractory.allowed) return null;

  // 2. Coalesce rapid signals
  const coalesceResult = shouldCoalesce(signal, topic, { now, coalesceMs: opts.coalesceMs });
  if (!coalesceResult.shouldEmit) return null;

  // 3. Record emission and return aggregated signals
  recordEmission(senderId, topic, { now });
  return {
    ...signal,
    coalesced: coalesceResult.aggregated.length > 1,
    coalescedCount: coalesceResult.aggregated.length,
    signals: coalesceResult.aggregated,
  };
}

function getBufferedTopics() {
  return [...coalescingBuffer.keys()];
}

module.exports = {
  coalesce,
  checkRefractory,
  recordEmission,
  flushBufferedTopic,
  getBufferedTopics,
  DEFAULT_REFRACTORY_MS,
  DEFAULT_COALESCE_MS,
};
