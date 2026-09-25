const { getDatabase } = require('../db');
const { SIGNAL_TYPES, unpackSignalPayload, formatSignalForTransport } = require('./biomimeticSignalingBus');
const { routeCollectiveSignal } = require('./collectiveSignalOrganizationRouter');
const signalRepressor = require('./signalRepressorService');
const receptor = require('./signalReceptorService');
const signalEventBus = require('./signalEventBus');
const signalCoalescer = require('./signalCoalescerService');
const plasticity = require('./synapticPlasticityService');
const tensor = require('./tensorCompatibilityService');
const signalMetrics = require('./signalMetricsService');
const { checkRateLimit, validatePayloadSize, validateArgs, retryDbOperation } = require('./signalValidationUtils');
const runtimeMissionExecution = require('./agentRuntimeAdapter/missionExecution');
const { updateAgent: runtimeUpdateAgent } = require('./agentOrchestrationState');
const dynamicOrg = require('./dynamicOrganizationService');
const signalDelivery = require('./signalDeliveryService');
const { recordPendingDeliveries } = require('./signalDeliveryHelpers');
const { createEnvelope, verifyEnvelopePayload } = require('./communication/communicationEnvelopeService');

const DEFAULT_SIGNAL_TTL_MS = 30_000;
const LOCAL_BROADCAST_LOG = new Map();
const MAX_LOCAL_LOG_SIZE = 1000;

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

function repressionFor({ type, topic, signalData, repressors }) {
  return signalRepressor.applyRepressors({ kind: type, topic, signalData }, repressors);
}

async function persistSignalRow(row) {
  try {
    const db = await getDatabase();
    await retryDbOperation(() =>
      db.run(
        `INSERT OR REPLACE INTO signal_blobs
         (signal_id, signal_type, signal_blob, content, topic, sender_agent_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
        [row.signal_id, row.signal_type, row.signal_blob, row.content, row.topic, row.sender_agent_id, row.expires_at]
      )
    );
    signalMetrics.recordPublish();
  } catch (e) {
    signalMetrics.recordDbError(e);
    throw Object.assign(new Error(`Signal persistence failed after retries: ${e.message}`), {
      code: 'SIGNAL_PERSISTENCE_FAILED',
      cause: e,
    });
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

function dataKeysOf(signalData) {
  if (!signalData || typeof signalData !== 'object') return [];
  return Object.keys(signalData).slice(0, 20);
}

function emitToBus(signal) {
  signalEventBus.publish({
    signalId: signal.id,
    signalType: signal.normalizedType,
    signalData: signal.signalData,
    topic: signal.topic,
    senderAgentId: signal.senderAgentId,
    concentration: signal.signalData?.concentration ?? signal.signalData?.intensity ?? 1.0,
    recipientAgentIds: signal.recipientAgentIds,
    llmRequired: signal.llmRequired === true,
    payloadRef: signal.id,
    artifactRef: signal.signalData?.artifactRef || signal.signalData?.artifact_id || null,
    semanticType: signal.signalData?.semanticType || signal.normalizedType,
    dataKeys: dataKeysOf(signal.signalData),
  });
}

function handleSuppressed(signal) {
  if (signal.senderAgentId) {
    plasticity.recordSignalOutcome({ senderId: signal.senderAgentId, receiverId: null, outcome: 'suppressed', signalType: signal.normalizedType });
  }
  signalMetrics.recordSuppressed();
  signalMetrics.recordOutcome('suppressed');
  // Supprimé (coalescé) = NON publié : published:false, sinon livraison fantôme.
  return { signalId: signal.id, published: false, coalesced: true, suppressed: true, signalType: signal.formatted.signalType, routing: { routed: false, reason: 'coalesced' } };
}

async function dispatchReceptorsIfNeeded(signal) {
  const ctx = {
    publishSignal: signal.publishSignal,
    startMission: async (mission) => ({ started: true, agentId: mission.agentId, result: await runtimeMissionExecution.startMission(mission) }),
    updateAgent: async (agentId, status, currentTask) => { await runtimeUpdateAgent(agentId, status, currentTask); return { updated: true, agentId, status }; },
    changeOrganization: async (options) => ({ changed: true, organization: (await dynamicOrg.changeOrganization(await getDatabase(), options)) }),
  };
  const result = await receptor.matchAndDispatch(
    { signalId: signal.signalId, signalType: signal.signalType, semanticType: signal.signalData?.semanticType || signal.signalType, concentration: signal.signalData?.concentration ?? signal.signalData?.intensity ?? 1.0, topic: signal.topic, senderAgentId: signal.senderAgentId, depth: Number(signal.depth || 0), recipientAgentIds: Array.isArray(signal.recipientAgentIds) ? signal.recipientAgentIds : [] },
    ctx
  );
  return { dispatched: result.dispatched.length > 0, results: result.dispatched, triggered: result.triggered, llmRequired: result.llmRequired };
}

function updatePlasticityForRecipients(signal, dispatchResult, routing) {
  if (!signal.senderAgentId || !routing.recipients) return;
  for (const recipient of routing.recipients) {
    if (recipient.agentId) {
      const outcome = dispatchResult.dispatched ? 'receptor_triggered' : 'no_effect';
      plasticity.recordSignalOutcome({ senderId: signal.senderAgentId, receiverId: recipient.agentId, outcome, signalType: signal.normalizedType });
    }
  }
}

async function routeSignal(signal, params) {
  return routeCollectiveSignal({
    db: await getDatabase().catch(() => null), signalId: signal.id,
    signalType: signal.formatted.signalType, signalData: signal.signalData,
    orchestratorId: signal.senderAgentId, recipientAgentIds: params.recipientAgentIds,
  });
}

function scopeMismatchResult(signal, routing) {
  if (routing.routingMode !== 'scope_mismatch') return null;
  return { signalId: signal.id, published: false, signalType: signal.formatted.signalType,
    suppressedBy: 'recipient_scope', suppressionReason: 'One or more requested recipients are outside the authorized routing scope.', routing };
}

async function routeAndDispatch(signal, params) {
  const routing = await routeSignal(signal, params);
  const mismatch = scopeMismatchResult(signal, routing);
  if (mismatch) return mismatch;
  // Destinataires AVANT dispatch : les récepteurs ciblés matchent dessus, jamais sur l'émetteur.
  const recipientAgentIds = (routing.recipients || []).filter((r) => r.kind === 'agent' && r.agentId).map((r) => r.agentId);
  let dispatchResult = { dispatched: false };
  try {
    dispatchResult = await dispatchReceptorsIfNeeded({
      signalId: signal.id,
      signalType: signal.formatted.signalType,
      signalData: signal.signalData,
      topic: signal.topic,
      senderAgentId: signal.senderAgentId,
      depth: Number(signal.depth || 0),
      recipientAgentIds,
      ttlMs: signal.ttlMs,
      publishSignal,
    });
  } catch (err) {
    console.warn(`[SignalingTransport] dispatchReceptors failed for ${signal.id}: ${err.message}`);
  }
  signalMetrics.recordDispatch();
  if (dispatchResult.dispatched) signalMetrics.recordTrigger();
  updatePlasticityForRecipients(signal, dispatchResult, routing);
  // F2: aucun récepteur matché => escalation LLM seule, pas d'envoi workers.
  if (dispatchResult.llmRequired) {
    emitToBus({ ...signal, recipientAgentIds: [], llmRequired: true });
    return { signalId: signal.id, published: true, coalesced: false, coalescedCount: 1, signalType: signal.formatted.signalType, routing, llmRequired: true };
  }
  if (recipientAgentIds.length > 0) {
    signalMetrics.recordSignalRouted();
    for (const rid of recipientAgentIds) signalMetrics.recordDeliveryEnqueued();
    await recordPendingDeliveries(signal.id, recipientAgentIds);
  } else {
    signalMetrics.recordOutcome('ignored');
  }
  emitToBus({ ...signal, recipientAgentIds, llmRequired: false });
  return { signalId: signal.id, published: true, coalesced: false, coalescedCount: 1, signalType: signal.formatted.signalType, routing, llmRequired: false };
}

async function publishSignal(params) {
  validateArgs(params);
  const signal = await buildSignalFromParams(params);
  if (!signal.accepted) return signal.result;

  if (signal.senderAgentId && !checkRateLimit(signal.senderAgentId)) {
    return { signalId: signal.id, published: false, signalType: signal.normalizedType, suppressedBy: 'rate_limit', suppressionReason: `Exceeded 120/min` };
  }

  const sizeCheck = validatePayloadSize(signal.signalData, signal.formatted?.signalBlob);
  if (!sizeCheck.valid) {
    return { signalId: signal.id, published: false, signalType: signal.normalizedType, suppressedBy: 'payload_size', suppressionReason: sizeCheck.reason };
  }

  const tensorError = validateTensor(signal);
  if (tensorError) return tensorError;

  // Coalescence AVANT persistance : un signal supprimé ne laisse aucune trace (anti-rejeu).
  const coalesced = signalCoalescer.coalesce({
    signalId: signal.id,
    signalType: signal.normalizedType,
    signalData: signal.signalData,
    topic: signal.topic,
    senderAgentId: signal.senderAgentId,
  });
  if (!coalesced) return handleSuppressed(signal);

  await persistSignalRow(buildRow({ id: signal.id, formatted: signal.formatted, topic: signal.topic, senderAgentId: signal.senderAgentId, expiresAt: signal.expiresAt }));
  pushLocalLog(signal.id, signal.formatted);

  return await routeAndDispatch(signal, params);
}

async function buildSignalFromParams(params) {
  const { signalType, signalData = {}, topic = '', senderAgentId = null, signalId = null, ttlMs = DEFAULT_SIGNAL_TTL_MS, contentFallback = null, repressors = [], depth = 0 } = params;
  const payloadData = signalData || {};
  const normalizedType = validateSignalType(signalType);
  const repression = repressionFor({ type: normalizedType, topic, signalData: payloadData, repressors });
  if (!repression.accepted) {
    return { accepted: false, result: buildRejectedResult(signalId, normalizedType, repression) };
  }
  const id = signalId || `sig_${require('crypto').randomUUID()}`;
  const envelope = buildSignalEnvelope({
    params, id, normalizedType, payloadData, ttlMs, senderAgentId
  });
  const transportData = Object.assign({}, payloadData, { communicationEnvelope: envelope });
  const formatted = formatSignalForTransport({ signalType: normalizedType, signalData: transportData, contentFallback });
  return { accepted: true, id, formatted, normalizedType, signalData: transportData, topic: String(topic || '').trim(), senderAgentId, ttlMs, depth: Math.max(0, Number(depth || 0)), expiresAt: ttlMs > 0 ? new Date(Date.now() + ttlMs).toISOString() : null };
}

function buildSignalEnvelope(input) {
  const { params, id, normalizedType, payloadData, ttlMs, senderAgentId } = input;
  return createEnvelope({
    messageId: id, kind: 'signal', senderAgentId, recipientAgentIds: params.recipientAgentIds,
    channel: params.channel || 'signal', modality: normalizedType, semanticRefs: params.semanticRefs,
    artifactRefs: params.artifactRefs || [payloadData.artifactRef || payloadData.artifact_id].filter(Boolean),
    scope: params.scope || null, groundingRequired: params.groundingRequired,
    ttlMs, payload: payloadData
  });
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
  return { signal_id: id, signal_type: formatted.signalType, signal_blob: formatted.signalBlob || null, content: formatted.content || '', topic: String(topic || '').trim(), sender_agent_id: senderAgentId || null, expires_at: expiresAt };
}

async function readSignalsForAgent(subscriberAgentId, since = null, limit = 100) {
  // Pas de rejeu : déjà vus/livrés/ackés (signal_deliveries) exclus.
  let sql = `SELECT DISTINCT s.signal_id, s.signal_type, s.signal_blob, s.content, s.topic, s.sender_agent_id, s.created_at FROM signal_blobs s
             LEFT JOIN signal_subscriptions sub ON sub.topic = s.topic AND sub.subscriber_agent_id = ?
             WHERE s.signal_type != 'text' AND s.sender_agent_id != ? AND (sub.subscriber_agent_id IS NOT NULL OR s.topic = '')
             AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
             AND NOT EXISTS (SELECT 1 FROM signal_deliveries d WHERE d.signal_id = s.signal_id AND d.subscriber_agent_id = ? AND d.status IN ('seen', 'delivered', 'acked'))
             ${since ? 'AND s.created_at > ?' : ''} ORDER BY s.created_at DESC LIMIT ?`;
  const vals = since ? [subscriberAgentId, subscriberAgentId, subscriberAgentId, since, limit] : [subscriberAgentId, subscriberAgentId, subscriberAgentId, limit];

  try {
    const db = await getDatabase();
    const rows = await retryDbOperation(() => db.all(sql, vals));
    return rows.map(decodeSignalRow).filter(Boolean);
  } catch (e) {
    console.warn('[SignalingTransport] readSignalsForAgent failed after retries:', e.message);
    return [];
  }
}

function decodeSignalRow(row) {
  const decoded = row.signal_blob ? unpackSignalPayload(row.signal_blob, row.signal_type) : null;
  const envelope = decoded?.communicationEnvelope;
  const result = { signalId: row.signal_id, signalType: row.signal_type, signalBlob: row.signal_blob, content: row.content, topic: row.topic, senderAgentId: row.sender_agent_id, createdAt: row.created_at, decoded };
  if (!envelope) return { ...result, integrity: { status: 'legacy_unverified' } };
  const { communicationEnvelope, ...payload } = decoded;
  const verification = verifyEnvelopePayload(communicationEnvelope, payload);
  const boundToRow = communicationEnvelope.messageId === row.signal_id
    && communicationEnvelope.senderAgentId === (row.sender_agent_id || null)
    && communicationEnvelope.modality === row.signal_type;
  if (!verification.valid || !boundToRow) {
    return { ...result, decoded: null, integrity: { status: 'rejected', reason: verification.reason || 'metadata_mismatch' } };
  }
  return { ...result, integrity: { status: 'verified', messageId: communicationEnvelope.messageId } };
}

async function markSignalsSeen(subscriberAgentId, signalIds) {
  if (!signalIds || !signalIds.length) return;
  const db = await getDatabase().catch(() => null);
  if (!db) return;
  try {
    await db.exec('BEGIN IMMEDIATE');
    for (const sid of signalIds) {
      // INSERT OR IGNORE puis UPDATE sans régresser 'acked'.
      await db.run(`INSERT OR IGNORE INTO signal_deliveries (signal_id, subscriber_agent_id, status, seen_at) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)`, [sid, subscriberAgentId]);
      await db.run(`UPDATE signal_deliveries SET status = 'seen', seen_at = CURRENT_TIMESTAMP WHERE signal_id = ? AND subscriber_agent_id = ? AND status != 'acked'`, [sid, subscriberAgentId]);
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
    await retryDbOperation(() => db.run(`DELETE FROM signal_blobs WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`));
    await retryDbOperation(() => db.run(`DELETE FROM signal_subscriptions WHERE subscriber_agent_id NOT IN (SELECT id FROM agents)`));
    // Grâce ACK 7j aux workers éphémères : un ACK reste une preuve, seuls les
    // statuts non terminaux d'agents disparus sont purgés sans délai.
    await retryDbOperation(() => db.run(
      `DELETE FROM signal_deliveries WHERE subscriber_agent_id NOT IN (SELECT id FROM agents) AND (status != 'acked' OR acked_at IS NULL OR acked_at < datetime('now', '-7 days'))`
    ));
  } catch (e) {
    console.warn('[SignalingTransport] purgeExpiredSignals failed after retries:', e.message);
  }
}

function localSignalsSince(sinceTs) {
  const results = [];
  for (const [id, entry] of LOCAL_BROADCAST_LOG) {
    if (entry.t > sinceTs) results.push({ signalId: id, ...entry.payload, receivedAt: entry.t });
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
  subscribeAgent: signalDelivery.subscribeAgent,
  unsubscribeAgent: signalDelivery.unsubscribeAgent,
  recordPendingDelivery: signalDelivery.recordPendingDelivery,
  markDelivered: signalDelivery.markDelivered,
  ackDelivery: signalDelivery.ackDelivery,
  getPendingDeliveries: signalDelivery.getPendingDeliveries,
  DEFAULT_SIGNAL_TTL_MS,
  LOCAL_BROADCAST_LOG,
};
