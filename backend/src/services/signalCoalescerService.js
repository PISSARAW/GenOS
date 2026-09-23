/**
 * Signal Coalescer — anti-spam & refractory period enforcement
 *
 * Biological systems avoid signal storms through:
 *   - Refractory periods: after emitting, an agent cannot emit again for N ms
 *   - Coalescing: rapid updates about the same topic are aggregated
 *   - Threshold crossing: only emit when a value crosses a boundary
 *
 * Cette couche est entre les signaux bruts et l'event bus / dispatch récepteur.
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

function pickConcentration(signals) {
  let best = 0;
  for (const s of signals) {
    const v = Number(s.signalData?.concentration ?? s.signalData?.intensity ?? 0);
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best;
}

function aggregateSignals(signals, topic) {
  const first = signals[0] || {};
  return {
    ...first,
    topic: first.topic || topic,
    signalData: {
      ...(first.signalData || {}),
      concentration: pickConcentration(signals),
      coalescedFrom: signals.map((s) => s.signalId),
    },
    coalesced: signals.length > 1,
    coalescedCount: signals.length,
    signals,
  };
}

function shouldCoalesce(signal, topic, opts = {}) {
  const now = opts.now || Date.now();
  const coalesceMs = opts.coalesceMs || DEFAULT_COALESCE_MS;
  const buf = coalescingBuffer.get(topic);
  if (!buf) return { shouldEmit: true, aggregated: [signal] };
  const age = now - buf.firstEmitAt;
  if (age >= coalesceMs) {
    const aggregated = [...buf.signals, signal];
    coalescingBuffer.delete(topic);
    return { shouldEmit: true, aggregated };
  }
  buf.signals.push(signal);
  buf.lastEmitAt = now;
  return { shouldEmit: false, aggregated: buf.signals };
}

function bufferSignal(signal, topic) {
  const key = topic || signal.topic || 'default';
  const existing = coalescingBuffer.get(key);
  if (existing) {
    existing.signals.push(signal);
    existing.lastEmitAt = Date.now();
    return;
  }
  coalescingBuffer.set(key, {
    signals: [],
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

function flushAndAggregate(topic, opts = {}) {
  const buffered = flushBufferedTopic(topic);
  if (!buffered.length) return null;
  return aggregateSignals(buffered, topic);
}

function clearAllCoalescerState() {
  coalescingBuffer.clear();
  refractoryLog.clear();
}

/**
 * True windowed coalescing + refractory:
 * S1 emits immediately and opens a window; S2..Sn inside the window
 * are buffered (return null); the first signal after the window
 * aggregates buffered + itself into one emission.
 */
function coalesce(signal, opts = {}) {
  const now = opts.now || Date.now();
  const topic = signal.topic || 'default';
  const senderId = signal.senderAgentId;
  const refractory = checkRefractory(senderId, topic, { now, refractoryMs: opts.refractoryMs });
  if (!refractory.allowed) return null;
  const coalesceResult = shouldCoalesce(signal, topic, { now, coalesceMs: opts.coalesceMs });
  if (!coalesceResult.shouldEmit) return null;
  recordEmission(senderId, topic, { now });
  if (coalesceResult.aggregated.length <= 1) {
    bufferSignal(signal, topic);
  }
  return aggregateSignals(coalesceResult.aggregated, topic);
}

function getBufferedTopics() {
  return [...coalescingBuffer.keys()];
}

function getBufferedCount(topic) {
  return coalescingBuffer.get(topic)?.signals.length || 0;
}

module.exports = {
  coalesce,
  checkRefractory,
  recordEmission,
  bufferSignal,
  shouldCoalesce,
  aggregateSignals,
  flushBufferedTopic,
  flushAndAggregate,
  getBufferedTopics,
  getBufferedCount,
  clearAllCoalescerState,
  DEFAULT_REFRACTORY_MS,
  DEFAULT_COALESCE_MS,
};
