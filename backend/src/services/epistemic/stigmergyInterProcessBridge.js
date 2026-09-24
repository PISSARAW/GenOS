'use strict';

/**
 * Pont stigmergie inter-process AEIS.
 *
 * Persiste les phéromones épistémiques en base (`signal_blobs`, type
 * `pheromone`) pour permettre la communication inter-process (workers
 * isolés, métapopulation, biocénose).
 *
 * Sans base disponible, le dépôt est LOCAL-ONLY (retourne `localOnly: true`,
 * lisible uniquement via le blob retourné) : il ne traverse PAS les
 * processus. Ne jamais confondre un dépôt local-only avec un signal partagé.
 *
 * Types de signaux phéromonaux :
 * - EPISTEMIC_CONTRADICTION
 * - EPISTEMIC_VERIFIER_SUCCESS
 * - EPISTEMIC_VERIFIER_FAILURE
 * - EPISTEMIC_DOMAIN_GAP
 * - EPISTEMIC_KNOWN_FAILURE
 * - EPISTEMIC_HIGH_RISK
 */

const SIGNAL_TYPES = Object.freeze({
  EPISTEMIC_CONTRADICTION: 'epistemic_contradiction',
  EPISTEMIC_VERIFIER_SUCCESS: 'epistemic_verifier_success',
  EPISTEMIC_VERIFIER_FAILURE: 'epistemic_verifier_failure',
  EPISTEMIC_DOMAIN_GAP: 'epistemic_domain_gap',
  EPISTEMIC_KNOWN_FAILURE: 'epistemic_known_failure',
  EPISTEMIC_HIGH_RISK: 'epistemic_high_risk',
});

function isSupportedType(type) {
  return Object.values(SIGNAL_TYPES).includes(type);
}

async function optionalDb(provided) {
  if (provided) return provided;
  try {
    const { getDatabase } = require('../../db');
    return await getDatabase();
  } catch (_) {
    return null;
  }
}

function packPheromone(bus, signal) {
  return bus.packSignalPayload(bus.SIGNAL_TYPES.PHEROMONE, {
    type: signal.type,
    payload: signal.payload,
    locus: signal.locus,
    locusHash: signal.locusHash,
    intensity: signal.intensity,
    isRepellent: signal.isRepellent,
  });
}

async function persistPheromone(db, blob, signal) {
  const crypto = require('node:crypto');
  const signalId = signal.signalId || `pher_${crypto.randomUUID()}`;
  await db.run(
    `INSERT OR REPLACE INTO signal_blobs
     (signal_id, signal_type, signal_blob, content, topic, sender_agent_id, created_at, expires_at)
     VALUES (?, 'pheromone', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    signalId,
    blob,
    '',
    signal.locus ? String(signal.locus) : '',
    signal.senderAgentId || null,
    signal.expiresAt || null
  );
  return signalId;
}

/**
 * Dépose un signal phéromonal dans l'environnement partagé (DB signal_blobs).
 * Retourne `localOnly: true` si aucune base n'est disponible (non partagé).
 */
async function depositPheromone(signal, opts = {}) {
  if (!signal || !isSupportedType(signal.type)) {
    throw new Error(`Unsupported pheromone type: ${signal && signal.type}`);
  }
  const bus = opts.bus || require('../biomimeticSignalingBus');
  const blob = packPheromone(bus, signal);
  const db = await optionalDb(opts.db);
  if (!db) {
    return {
      localOnly: true,
      signalType: bus.SIGNAL_TYPES.PHEROMONE,
      signalBlob: blob,
      content: '',
      depositedAt: new Date().toISOString(),
    };
  }
  const signalId = await persistPheromone(db, blob, signal);
  return {
    localOnly: false,
    signalId,
    signalType: bus.SIGNAL_TYPES.PHEROMONE,
    signalBlob: blob,
    content: '',
    depositedAt: new Date().toISOString(),
  };
}

function decodePheromoneBlob(bus, blob, fallbackJson) {
  const unpacked = bus.unpackSignalPayload(blob, bus.SIGNAL_TYPES.PHEROMONE, fallbackJson);
  return Array.isArray(unpacked) ? unpacked : [unpacked];
}

function pheromoneLimit(opts) {
  return Math.max(1, Math.min(500, Number(opts.limit) || 100));
}

async function fetchPheromoneRows(db, opts, limit) {
  const base = `SELECT signal_blob FROM signal_blobs WHERE signal_type = 'pheromone'`;
  const expiry = `AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) ORDER BY created_at DESC LIMIT ?`;
  if (opts.locus) return db.all(`${base} AND topic = ? ${expiry}`, String(opts.locus), limit);
  return db.all(`${base} ${expiry}`, limit);
}

function decodePheromoneRows(bus, rows, fallbackJson) {
  const out = [];
  for (const row of rows || []) {
    try {
      const unpacked = bus.unpackSignalPayload(row.signal_blob, bus.SIGNAL_TYPES.PHEROMONE, fallbackJson);
      if (Array.isArray(unpacked)) out.push(...unpacked);
      else if (unpacked) out.push(unpacked);
    } catch (_) {}
  }
  return out;
}

/**
 * Lit les signaux phéromonaux persistés (DB) ou décode un blob local-only.
 */
async function readPheromones(opts = {}) {
  const bus = opts.bus || require('../biomimeticSignalingBus');
  if (opts.blob) return decodePheromoneBlob(bus, opts.blob, opts.fallbackJson);
  const db = await optionalDb(opts.db);
  if (!db) return [];
  const rows = await fetchPheromoneRows(db, opts, pheromoneLimit(opts));
  return decodePheromoneRows(bus, rows, opts.fallbackJson);
}

module.exports = {
  SIGNAL_TYPES,
  isSupportedType,
  depositPheromone,
  readPheromones,
};
