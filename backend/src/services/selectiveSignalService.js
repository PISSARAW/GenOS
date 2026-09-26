'use strict';

/**
 * Workspace sélectif à récepteurs (botanique : signal systémique ciblé).
 *
 * Antithèse du broadcast textuel massif : un signal porte
 * {modality, origin, intensity, signature, scope, urgency, ttl} et n'est
 * livré qu'aux agents dont les récepteurs l'acceptent (rôle + modalité +
 * intensité effective). Les récepteurs se DÉsensibilisent (× 0,7 par
 * livraison, récupération +0,2/h) : une alarme persistante cesse de
 * déclencher. Livraison réelle dans signal_blobs/signal_deliveries
 * (statut pending). dispatch() lève sur entrée invalide ; jamais sur
 * stockage indisponible (retourne delivered: []).
 */

const { AdaptiveStateService } = require('./adaptiveStateService');
const { lineageCircuit } = require('./integrationProxyService');

const SCOPE = 'signal_sensitivity';
const SENSITIVITY_FLOOR = 0;
const DESENSITIZE_FACTOR = 0.7;
const RECOVERY_PER_HOUR = 0.2;
const MAX_SENSITIVITIES = 100;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

const RECEPTORS = {
  orchestrator: { modalities: ['arousal', 'threat', 'directive'], minIntensity: 0.3 },
  worker: { modalities: ['arousal', 'directive'], minIntensity: 0.4 },
  daemon: { modalities: ['threat'], minIntensity: 0.5 },
  default: { modalities: ['arousal'], minIntensity: 0.6 }
};

const TYPE_OF_MODALITY = { arousal: 'voltage', threat: 'voltage', directive: 'ligand', memory: 'pheromone', capability: 'plasmid' };

async function openDb(handle) {
  if (handle && typeof handle.get === 'function') return { db: handle, close: null };
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  return { db, close: () => require('./db').closeDatabase().catch(() => {}) };
}

function receptorFor(role) {
  const name = String(role || '').toLowerCase();
  if (name.includes('orchestrator')) return RECEPTORS.orchestrator;
  if (name.includes('worker')) return RECEPTORS.worker;
  if (name.includes('daemon')) return RECEPTORS.daemon;
  return RECEPTORS.default;
}

function validSignal(signal) {
  return signal && typeof signal === 'object'
    && typeof signal.modality === 'string' && !!signal.modality
    && typeof signal.signature === 'string' && !!signal.signature
    && typeof signal.agentId === 'string' && !!signal.agentId
    && Number.isFinite(Number(signal.intensity));
}

function effectiveLevel(levels, signature, now) {
  const entry = levels[signature];
  if (!entry) return 1;
  const recovered = Math.min(1, entry.level + ((now - entry.at) / 3600000) * RECOVERY_PER_HOUR);
  return Math.max(SENSITIVITY_FLOOR, recovered);
}

function afterDelivery(levels, signature, now) {
  const pruned = { ...levels };
  pruned[signature] = { level: effectiveLevel(pruned, signature, now) * DESENSITIZE_FACTOR, at: now };
  const keys = Object.keys(pruned);
  if (keys.length > MAX_SENSITIVITIES) delete pruned[keys[0]];
  return pruned;
}

async function agentRoles(db, agentIds) {
  const roles = {};
  try {
    const placeholders = agentIds.map(() => '?').join(',');
    const rows = await db.all(`SELECT id, role FROM agents WHERE id IN (${placeholders})`, ...agentIds);
    for (const row of rows || []) roles[row.id] = row.role || null;
  } catch (_) {}
  return roles;
}

async function deliverTo(db, signal, agentId) {
  const signalId = `sig_${Date.now()}_${Math.floor(Math.random() * 0xffff).toString(16)}`;
  const ttl = Number.isFinite(Number(signal.ttlMs)) && Number(signal.ttlMs) > 0 ? Number(signal.ttlMs) : DEFAULT_TTL_MS;
  await db.run(
    `INSERT INTO signal_blobs (signal_id, signal_type, content, topic, sender_agent_id, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
    signalId,
    TYPE_OF_MODALITY[signal.modality] || 'text',
    String(signal.content || `${signal.modality}:${signal.signature}`),
    String(signal.topic || signal.modality),
    signal.origin || signal.agentId,
    `+${Math.floor(ttl / 1000)} seconds`
  );
  await db.run(
    `INSERT OR IGNORE INTO signal_deliveries (signal_id, subscriber_agent_id, status) VALUES (?, ?, 'pending')`,
    signalId, agentId
  );
  return signalId;
}

async function dispatch(db, signal) {
  if (!validSignal(signal)) throw new Error('dispatch requires modality, signature, agentId and numeric intensity');
  const intensity = Math.max(0, Math.min(1, Number(signal.intensity)));
  const now = Date.now();
  let opened = null;
  try {
    opened = await openDb(db);
    const store = new AdaptiveStateService(opened.db);
    const agents = await lineageCircuit(opened.db, signal.agentId, 8);
    const roles = await agentRoles(opened.db, agents);
    const stored = (await store.restoreObject(SCOPE, signal.agentId)) || {};
    let levels = stored.levels && typeof stored.levels === 'object' ? stored.levels : {};
    const delivered = [];
    const suppressed = [];
    for (const id of agents) {
      const receptor = receptorFor(roles[id]);
      if (!receptor.modalities.includes(signal.modality)) {
        suppressed.push({ agentId: id, reason: 'no_receptor' });
        continue;
      }
      const effective = intensity * effectiveLevel(levels, signal.signature, now);
      if (effective < receptor.minIntensity) {
        suppressed.push({ agentId: id, reason: levels[signal.signature] ? 'desensitized' : 'below_threshold' });
        continue;
      }
      try {
        await deliverTo(opened.db, signal, id);
        levels = afterDelivery(levels, signal.signature, now);
        delivered.push(id);
      } catch (_) {
        suppressed.push({ agentId: id, reason: 'delivery_failed' });
      }
    }
    await store.persistObject(SCOPE, signal.agentId, { levels }, Object.keys(levels).length).catch(() => {});
    return { delivered, suppressed, modality: signal.modality, signature: signal.signature };
  } catch (_) {
    return { delivered: [], suppressed: [], modality: signal.modality, signature: signal.signature };
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

module.exports = { dispatch, RECEPTORS };
