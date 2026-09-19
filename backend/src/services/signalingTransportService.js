/**
 * Zero-Text Inter-Agent Signaling Transport Service
 *
 * Persiste et distribue les signaux zero-texte (ligands, potentiels,
 * phéromones stigmergiques, plasmides HGT, tenseurs latents) via SQLite
 * WAL + mémoire Map pour les agents locaux.
 *
 * Ce module relie biomimeticSignalingBus.js au transport SQLite des outils
 * explicites genos_signal_* et des services de décision collective. Il ne
 * constitue pas un chemin commun au dispatch des handlers biomimétiques.
 */

const { getDatabase } = require('../db');
const { SIGNAL_TYPES, packSignalPayload, unpackSignalPayload, formatSignalForTransport } = require('./biomimeticSignalingBus');
const { routeCollectiveSignal } = require('./collectiveSignalOrganizationRouter');
const signalRepressor = require('./signalRepressorService');
const boundedGossip = require('./boundedGossipService');
const gapJunction = require('./gapJunctionService');

// Court TTL par défaut pour les signaux ephemeraires (phéromones, voltage)
const DEFAULT_SIGNAL_TTL_MS = 30_000;

// Registre local des signaux broadcast (non-persistés, volatils)
const LOCAL_BROADCAST_LOG = new Map(); // signalId -> { payload, t }

function pushLocalLog(signalId, payload) {
  LOCAL_BROADCAST_LOG.set(signalId, { payload, t: Date.now() });
  // Nettoyage anciens logs (> 30s)
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

/**
 * Publie un signal zero-texte dans le bus transport.
 * - Persiste dans signal_blobs si db disponible
 * - Log localement pour les agents du même processus
 */
async function publishSignal(params) {
  const {
    signalType,
    signalData = {},
    topic = '',
    senderAgentId = null,
    signalId = null,
    ttlMs = DEFAULT_SIGNAL_TTL_MS,
    contentFallback = null,
    repressors = [],
    gossip = null,
    junction = null,
  } = params;

  const normalizedType = validateSignalType(signalType);

  const repression = repressionFor({ type: normalizedType, topic, signalData, repressors });
  if (!repression.accepted) {
    return {
      signalId: signalId || null,
      published: false,
      signalType: normalizedType,
      suppressedBy: repression.suppressedBy,
      suppressionReason: repression.reason
    };
  }

  const id = signalId || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const formatted = formatSignalForTransport({
    signalType: normalizedType,
    signalData,
    contentFallback,
  });

  const expiresAt = ttlMs > 0 ? new Date(Date.now() + ttlMs).toISOString() : null;
  const row = {
    signal_id: id,
    signal_type: formatted.signalType,
    signal_blob: formatted.signalBlob || null,
    content: formatted.content || '',
    topic: String(topic || '').trim(),
    sender_agent_id: senderAgentId || null,
    expires_at: expiresAt,
  };

  await persistSignalRow(row);

  pushLocalLog(id, formatted);
  const routing = await routeCollectiveSignal({
    db: await getDatabase().catch(() => null), signalId: id, signalType: formatted.signalType,
    signalData, orchestratorId: senderAgentId
  });
  const delivery = deliveryMetadata(params, id, expiresAt);
  return {
    signalId: id,
    published: true,
    signalType: formatted.signalType,
    routing,
    ...delivery
  };
}

/**
 * Lit les signaux non-lus pour un agent donné (topics qu'il écoute).
 */
async function readSignalsForAgent(subscriberAgentId, since = null, limit = 100) {
  let sql = `SELECT signal_id, signal_type, signal_blob, content, topic, sender_agent_id, created_at
             FROM signal_blobs
             WHERE signal_type != 'text' AND topic != ''
             ${since ? 'AND created_at > ?' : ''}
             ORDER BY created_at DESC
             LIMIT ?`;
  const vals = since ? [since, limit] : [limit];

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

/**
 * Marque les signaux comme vus pour un abonné.
 */
async function markSignalsSeen(subscriberAgentId, signalIds) {
  if (!signalIds || !signalIds.length) return;
  const db = await getDatabase().catch(() => null);
  if (!db) return;
  for (const sid of signalIds) {
    await db.run(
      `INSERT OR REPLACE INTO signal_subs (signal_id, topic, subscriber_agent_id, last_seen_at)
       VALUES (?, '', ?, CURRENT_TIMESTAMP)`,
      [sid, subscriberAgentId]
    ).catch(() => {});
  }
}

/**
 * Nettoie les signaux expirés.
 */
async function purgeExpiredSignals() {
  try {
    const db = await getDatabase();
    await db.run(`DELETE FROM signal_blobs WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`);
    await db.run(`DELETE FROM signal_subs WHERE subscriber_agent_id NOT IN (SELECT id FROM agents)`);
  } catch (e) {
    console.warn('[SignalingTransport] purgeExpiredSignals failed:', e.message);
  }
}

/**
 * Diffusion locale immédiate (hors DB) — pour les agents du même processus.
 * Retourne les signaux reçus depuis une horodatage.
 */
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
  DEFAULT_SIGNAL_TTL_MS,
  LOCAL_BROADCAST_LOG,
};
