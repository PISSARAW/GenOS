/**
 * Zero-Text Inter-Agent Signaling Transport Service
 */

const { getDatabase } = require('../db');
const { SIGNAL_TYPES, packSignalPayload, unpackSignalPayload, formatSignalForTransport } = require('./biomimeticSignalingBus');
const { routeCollectiveSignal } = require('./collectiveSignalOrganizationRouter');
const signalRepressor = require('./signalRepressorService');
const boundedGossip = require('./boundedGossipService');
const gapJunction = require('./gapJunctionService');
const receptor = require('./signalReceptorService');
const signalEventBus = require('./signalEventBus');
const signalCoalescer = require('./signalCoalescerService');
const plasticity = require('./synapticPlasticityService');
const tensor = require('./tensorCompatibilityService');

const DEFAULT_SIGNAL_TTL_MS = 30_000;
const LOCAL_BROADCAST_LOG = new Map();
const MAX_LOCAL_LOG_SIZE = 1000;
const MAX_SIGNAL_DATA_BYTES = 64 * 1024;
const MAX_SIGNAL_BLOB_BYTES = 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = 120;

const rateLimitWindow = new Map();

function checkRateLimit(senderId) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const entry = rateLimitWindow.get(senderId) || { count: 0, resetAt: now + 60_000 };
  if (entry.resetAt < windowStart) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  entry.count++;
  rateLimitWindow.set(senderId, entry);
  if (entry.count > RATE_LIMIT_PER_MINUTE) return false;
  if (rateLimitWindow.size > 1000) {
    const cutoff = now - 120_000;
    for (const [k, v] of rateLimitWindow) {
      if (v.resetAt < cutoff) rateLimitWindow.delete(k);
    }
  }
  return true;
}

function pushLocalLog(signalId, payload) {
  LOCAL_BROADCAST_LOG.set(signalId, { payload, t: Date.now() });
  if (LOCAL_BROADCAST_LOG.size > MAX_LOCAL_LOG_SIZE) {
    const oldest = LOCAL_BROADCAST_LOG.keys().next().value;
    LOCAL_BROADCAST_LOG.delete(oldest);
  }
  const cutoff = Date.now() - 60_000;
  for (const [id, entry] of LOCAL_BROADCAST_LOG) {
    if (entry.t < cutoff) LOCAL_BROADCAST_LOG.delete(id);
  }
}

function validateSignalType(signalType) {
  const normalizedType = String(signalType || '').trim().toLowerCase();
  if (!normalizedType || normalizedType === SIGNAL_TYPES.TEXT) {
    throw new Error('Zero-text signaling requires a non-text signal type.');
  }
  if (!Object.values(SIGNAL_TYPES).includes(normalizedType)) {
    throw new Error(`Unsupported signal type '${signalType}'.`);
  }
  return normalizedType;
}

function validatePayloadSize(signalData, signalBlob) {
  if (signalData) {
    const dataSize = Buffer.byteLength(JSON.stringify(signalData), 'utf8');
    if (dataSize > MAX_SIGNAL_DATA_BYTES) {
      return { valid: false, reason: `signalData exceeds ${MAX_SIGNAL_DATA_BYTES} bytes (${dataSize})` };
    }
  }
  if (signalBlob && signalBlob.length > MAX_SIGNAL_BLOB_BYTES) {
    return { valid: false, reason: `signalBlob exceeds ${MAX_SIGNAL_BLOB_BYTES} bytes (${signalBlob.length})` };
  }
  return { valid: true };
}

function repressionFor({ type, topic, signalData, repressors }) {
  return signalRepressor.applyRepressors({ kind: type, topic, signalData }, repressors);
}

function deliveryMetadata(params, id, expiresAt) {
  const { gossip, junction, senderAgentId } = params;
  const gossipRoutes = gossip ? boundedGossip.nextHop({
    message: { id, expiresAt }, agentId: senderAgentId, peers: gossip.peers,
    seen: gossip.seen || new Set(), options: gossip.options
  }) : [];
  const junctionDelta = junction ? gapJunction.exchange(junction, senderAgentId, junction.delta) : null;
  return { gossipRoutes, junctionDelta };
}

async function persistSignalRow(row) {
  try {
    const db = await getDatabase();
    await db.run(
      `INSERT OR REPLACE INTO signal_blobs
       (signal_id, signal_type, signal_blob, content, topic, sender_agent_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [row.signal_id, row.signal_type, row.signal_blob, row.content, row.topic, row.sender_agent_id, row.expires_at]
    );
  } catch (e) {
    console.warn('[SignalingTransport] DB publish failed, logging locally:', e.message);
  }
}

function validateTensor(signal) {
  if (signal.normalizedType !== 'tensor' || !signal.signalData) return null;
  const validation = tensor.validateTensorContract(signal.signalData.contract || {});
  if (!validation.valid) {
    return {
      signalId: signal.id,
      published: false,
      signalType: signal.normalizedType,
      suppressedBy: 'tensor_contract_validation',
      suppressionReason: `Invalid tensor contract: ${validation.errors.join(', ')}`,
    };
  }
  return null;
}

function emitToBus(signal) {
  signalEventBus.publish({
    signalId: signal.id,
    signalType: signal.normalizedType,
    signalData: signal.signalData,
    topic: signal.topic,
    senderAgentId: signal.senderAgentId,
    concentration: signal.signalData?.concentration ?? signal.signalData?.intensity ?? 1.0,
  });
}

function handleSuppressed(signal) {
  if (signal.senderAgentId) {
    plasticity.recordSignalOutcome({ senderId: signal.senderAgentId, receiverId: null, outcome: 'suppressed', signalType: signal.normalizedType });
  }
  return {
    signalId: signal.id,
    published: true,
    coalesced: true,
    suppressed: true,
    signalType: signal.formatted.signalType,
    routing: { routed: false, reason: 'coalesced' },
  };
}

async function routeAndDispatch(signal, params) {
  const routing = await routeCollectiveSignal({
    db: await getDatabase().catch(() => null),
    signalId: signal.id,
    signalType: signal.formatted.signalType,
    signalData: signal.signalData,
    orchestratorId: signal.senderAgentId,
  });
  const delivery = deliveryMetadata(params, signal.id, signal.expiresAt);
  let dispatchResult = { dispatched: false };
  try {
    dispatchResult = await dispatchReceptorsIfNeeded({
      signalId: signal.id,
      signalType: signal.formatted.signalType,
      signalData: signal.signalData,
      topic: signal.topic,
      senderAgentId: signal.senderAgentId,
      ttlMs: signal.ttlMs,
      publishSignal,
    });
  } catch (err) {
    console.warn(`[SignalingTransport] dispatchReceptors failed for ${signal.id}: ${err.message}`);
  }
  if (signal.senderAgentId && routing.recipients) {
    for (const recipient of routing.recipients) {
      if (recipient.agentId) {
        const outcome = dispatchResult.dispatched ? 'receptor_triggered' : 'no_effect';
        plasticity.recordSignalOutcome({ senderId: signal.senderAgentId, receiverId: recipient.agentId, outcome, signalType: signal.normalizedType });
      }
    }
  }
  return {
    signalId: signal.id,
    published: true,
    coalesced: false,
    coalescedCount: 1,
    signalType: signal.formatted.signalType,
    routing,
    ...delivery,
  };
}

async function publishSignal(params) {
  const signal = await buildSignalFromParams(params);
  if (!signal.accepted) return signal.result;

  if (signal.senderAgentId && !checkRateLimit(signal.senderAgentId)) {
    return { signalId: signal.id, published: false, signalType: signal.normalizedType, suppressedBy: 'rate_limit', suppressionReason: `Exceeded ${RATE_LIMIT_PER_MINUTE}/min` };
  }

  const sizeCheck = validatePayloadSize(signal.signalData, signal.formatted?.signalBlob);
  if (!sizeCheck.valid) {
    return { signalId: signal.id, published: false, signalType: signal.normalizedType, suppressedBy: 'payload_size', suppressionReason: sizeCheck.reason };
  }

  const tensorError = validateTensor(signal);
  if (tensorError) return tensorError;

  await persistSignalRow(buildRow({ id: signal.id, formatted: signal.formatted, topic: signal.topic, senderAgentId: signal.senderAgentId, expiresAt: signal.expiresAt }));
  pushLocalLog(signal.id, signal.formatted);

  emitToBus(signal);

  const coalesced = signalCoalescer.coalesce({
    signalId: signal.id,
    signalType: signal.normalizedType,
    signalData: signal.signalData,
    topic: signal.topic,
    senderAgentId: signal.senderAgentId,
  });
  if (!coalesced) return handleSuppressed(signal);

  return await routeAndDispatch(signal, params);
}

async function buildSignalFromParams(params) {
  const { signalType, signalData = {}, topic = '', senderAgentId = null, signalId = null, ttlMs = DEFAULT_SIGNAL_TTL_MS, contentFallback = null, repressors = [] } = params;
  const normalizedType = validateSignalType(signalType);
  const repression = repressionFor({ type: normalizedType, topic, signalData, repressors });
  if (!repression.accepted) {
    return { accepted: false, result: buildRejectedResult(signalId, normalizedType, repression) };
  }
  const id = signalId || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const formatted = formatSignalForTransport({ signalType: normalizedType, signalData, contentFallback });
  return { accepted: true, id, formatted, normalizedType, signalData, topic: String(topic || '').trim(), senderAgentId, ttlMs, expiresAt: ttlMs > 0 ? new Date(Date.now() + ttlMs).toISOString() : null };
}

function buildRejectedResult(signalId, normalizedType, repression) {
  return {
    signalId: signalId || null,
    published: false,
    signalType: normalizedType,
    suppressedBy: repression.suppressedBy,
    suppressionReason: repression.reason,
  };
}

function buildRow({ id, formatted, topic, senderAgentId, expiresAt }) {
  return {
    signal_id: id,
    signal_type: formatted.signalType,
    signal_blob: formatted.signalBlob || null,
    content: formatted.content || '',
    topic: String(topic || '').trim(),
    sender_agent_id: senderAgentId || null,
    expires_at: expiresAt,
  };
}

async function dispatchReceptorsIfNeeded(signal) {
  const triggered = receptor.matchReceptors({
    signalId: signal.signalId,
    signalType: signal.signalType,
    semanticType: signal.signalData?.semanticType || signal.signalType,
    concentration: signal.signalData?.concentration ?? signal.signalData?.intensity ?? 1.0,
    topic: signal.topic,
    senderAgentId: signal.senderAgentId,
  });
  if (triggered.length === 0) return { dispatched: false };
  const dispatched = await receptor.dispatchActions(
    triggered,
    {
      signalId: signal.signalId,
      signalType: signal.signalType,
      signalData: signal.signalData,
      topic: signal.topic,
      senderAgentId: signal.senderAgentId,
    },
    { publishSignal: signal.publishSignal }
  );
  return { dispatched: true, results: dispatched };
}

async function readSignalsForAgent(subscriberAgentId, since = null, limit = 100) {
  let sql = `SELECT DISTINCT s.signal_id, s.signal_type, s.signal_blob, s.content, s.topic, s.sender_agent_id, s.created_at
             FROM signal_blobs s
             LEFT JOIN signal_subs sub ON sub.topic = s.topic AND sub.subscriber_agent_id = ?
             WHERE s.signal_type != 'text'
             AND s.sender_agent_id != ?
             AND (sub.subscriber_agent_id IS NOT NULL OR s.topic = '')
             AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
             ${since ? 'AND s.created_at > ?' : ''}
             ORDER BY s.created_at DESC
             LIMIT ?`;
  const vals = since ? [subscriberAgentId, subscriberAgentId, since, limit] : [subscriberAgentId, subscriberAgentId, limit];

  try {
    const db = await getDatabase();
    const rows = await db.all(sql, vals);
    return rows.map(r => ({
      signalId: r.signal_id,
      signalType: r.signal_type,
      signalBlob: r.signal_blob,
      content: r.content,
      topic: r.topic,
      senderAgentId: r.sender_agent_id,
      createdAt: r.created_at,
      decoded: r.signal_blob ? unpackSignalPayload(r.signal_blob, r.signal_type) : null,
    }));
  } catch (e) {
    console.warn('[SignalingTransport] readSignalsForAgent failed:', e.message);
    return [];
  }
}

async function markSignalsSeen(subscriberAgentId, signalIds) {
  if (!signalIds || !signalIds.length) return;
  const db = await getDatabase().catch(() => null);
  if (!db) return;
  try {
    await db.exec('BEGIN IMMEDIATE');
    for (const sid of signalIds) {
      await db.run(
        `INSERT OR REPLACE INTO signal_subs (signal_id, topic, subscriber_agent_id, last_seen_at)
         VALUES (?, '', ?, CURRENT_TIMESTAMP)`,
        [sid, subscriberAgentId]
      );
    }
    await db.exec('COMMIT');
  } catch (e) {
    try { await db.exec('ROLLBACK'); } catch (_) {}
    console.warn('[SignalingTransport] markSignalsSeen failed:', e.message);
  }
}

async function purgeExpiredSignals() {
  try {
    const db = await getDatabase();
    await db.run(`DELETE FROM signal_blobs WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`);
    await db.run(`DELETE FROM signal_subs WHERE subscriber_agent_id NOT IN (SELECT id FROM agents)`);
  } catch (e) {
    console.warn('[SignalingTransport] purgeExpiredSignals failed:', e.message);
  }
}

function localSignalsSince(sinceTs) {
  const results = [];
  for (const [id, entry] of LOCAL_BROADCAST_LOG) {
    if (entry.t > sinceTs) {
      results.push({ signalId: id, ...entry.payload, receivedAt: entry.t });
    }
  }
  return results;
}

module.exports = {
  publishSignal,
  readSignalsForAgent,
  markSignalsSeen,
  purgeExpiredSignals,
  localSignalsSince,
  dispatchReceptorsIfNeeded,
  buildRow,
  buildRejectedResult,
  buildSignalFromParams,
  DEFAULT_SIGNAL_TTL_MS,
  LOCAL_BROADCAST_LOG,
};
