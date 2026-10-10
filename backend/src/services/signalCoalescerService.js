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
const REFERENCE_KEYS = ['artifactRef', 'artifact_id', 'claimId', 'proofId', 'resultRef',
  'ref', 'artifactRefs', 'targetId', 'nodeId'];
const EVENT_ID_KEYS = ['idempotencyKey', 'eventId', 'scientificEventId', 'resultId',
  'counterexampleResultId', 'receiptDigest'];

function hashTopic(topic) {
  return crypto.createHash('sha256').update(topic || '').digest('hex').slice(0, 8);
}

function buildRefractoryKey(senderId, topic) {
  return `${senderId || 'system'}:${topic || 'default'}`;
}

function signalIdentity(signal) {
  const data = signal.signalData || {};
  const event = firstDefined(data, ['eventType', 'event_type', 'semanticType']);
  const references = referenceIdentity(data);
  const eventIds = identityFields(data, EVENT_ID_KEYS);
  const version = firstDefined(data, ['artifactVersion', 'version', 'revision']);
  const recipients = [...(signal.recipientAgentIds || [])].sort();
  const idempotencyKey = firstDefined(data, ['idempotencyKey', 'eventId', 'scientificEventId']);
  if (references.present && !idempotencyKey) return null;
  const payloadDigest = references.present ? scientificPayloadDigest(data) : '';
  return JSON.stringify([signal.senderAgentId || 'system', signal.topic || 'default',
    signal.signalType || '', event, references, version, eventIds,
    data.verification?.receiptDigest || '', payloadDigest,
    recipients]);
}

function referenceIdentity(data) {
  const refs = identityFields(data, REFERENCE_KEYS);
  const semanticRefs = [...(data.communicationEnvelope?.semanticRefs || [])].sort();
  const artifactRefs = [...(data.communicationEnvelope?.artifactRefs || [])].sort();
  return { refs, semanticRefs, artifactRefs,
    present: Boolean(Object.keys(refs).length + semanticRefs.length + artifactRefs.length) };
}

function scientificPayloadDigest(data) {
  const { communicationEnvelope, ...payload } = data;
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function identityFields(data, keys) {
  return Object.fromEntries(keys.filter((key) => data[key] !== undefined
    && data[key] !== null && data[key] !== '').map((key) => [key, data[key]]));
}

function firstDefined(data, keys) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key];
  }
  return '';
}

function isRetraction(signal) {
  const data = signal.signalData || {};
  return [data.eventType, data.event_type, data.semanticType, data.status]
    .some((event) => /retract|revok|invalidat|withdraw/i.test(String(event || '')));
}

function checkRefractory(senderId, topic, opts = {}) {
  const now = opts.now ?? Date.now();
  const refractoryMs = opts.refractoryMs ?? DEFAULT_REFRACTORY_MS;
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
  const now = opts.now ?? Date.now();
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
  const now = opts.now ?? Date.now();
  const coalesceMs = opts.coalesceMs ?? DEFAULT_COALESCE_MS;
  const buf = coalescingBuffer.get(topic);
  if (!buf) return { shouldEmit: true, aggregated: [signal] };
  const age = now - buf.firstEmitAt;
  if (age >= coalesceMs) {
    clearTimeout(buf.timer);
    coalescingBuffer.delete(topic);
    return { shouldEmit: true, aggregated: [signal] };
  }
  buf.signals.push(signal);
  buf.lastEmitAt = now;
  return { shouldEmit: false, aggregated: buf.signals };
}

function bufferSignal(signal, topic, opts = {}) {
  const key = topic || signal.topic || 'default';
  const existing = coalescingBuffer.get(key);
  if (existing) {
    existing.signals.push(signal);
    existing.lastEmitAt = opts.now ?? Date.now();
    return;
  }
  const now = opts.now ?? Date.now();
  const timer = setTimeout(() => coalescingBuffer.delete(key),
    Math.max(1, opts.coalesceMs ?? DEFAULT_COALESCE_MS));
  timer.unref?.();
  coalescingBuffer.set(key, {
    signals: [signal],
    firstEmitAt: now,
    lastEmitAt: now,
    timer,
  });
}

function flushBufferedTopic(topic) {
  for (const [key, buf] of coalescingBuffer) {
    if (key !== topic && (buf.signals[0]?.topic || 'default') !== topic) continue;
    clearTimeout(buf.timer);
    coalescingBuffer.delete(key);
    return buf.signals;
  }
  return [];
}

function flushAndAggregate(topic, opts = {}) {
  const buffered = flushBufferedTopic(topic);
  if (!buffered.length) return null;
  return aggregateSignals(buffered, topic);
}

function clearAllCoalescerState() {
  for (const buf of coalescingBuffer.values()) clearTimeout(buf.timer);
  coalescingBuffer.clear();
  refractoryLog.clear();
}

/**
 * True windowed coalescing + refractory:
 * S1 emits immediately and opens a window; later signals in that window
 * are suppressed. The buffer is inspectable until expiry but is not published.
 */
function coalesce(signal, opts = {}) {
  const now = opts.now ?? Date.now();
  const topic = signal.topic || 'default';
  if (isRetraction(signal)) return aggregateSignals([signal], topic);
  const identity = signalIdentity(signal);
  if (!identity) return aggregateSignals([signal], topic);
  const senderId = signal.senderAgentId;
  const refractory = checkRefractory(senderId, identity, { now, refractoryMs: opts.refractoryMs });
  if (!refractory.allowed) return null;
  const coalesceResult = shouldCoalesce(signal, identity, { now, coalesceMs: opts.coalesceMs });
  if (!coalesceResult.shouldEmit) return null;
  recordEmission(senderId, identity, { now });
  if (coalesceResult.aggregated.length <= 1) {
    bufferSignal(signal, identity, { now, coalesceMs: opts.coalesceMs });
  }
  return aggregateSignals(coalesceResult.aggregated, topic);
}

function getBufferedTopics() {
  return [...new Set([...coalescingBuffer.values()].map((buf) => buf.signals[0]?.topic || 'default'))];
}

function getBufferedCount(topic) {
  let count = 0;
  for (const [key, buf] of coalescingBuffer) {
    if (key === topic || (buf.signals[0]?.topic || 'default') === topic) count += buf.signals.length;
  }
  return count;
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
