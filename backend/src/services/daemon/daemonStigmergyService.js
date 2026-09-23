'use strict';

/**
 * Daemon Stigmergy Service — ADR 0034 D10.
 *
 * Champ stigmergique territorial : une observation indépendante
 * renforce (+pheromone), une réfutation repousse (-repellent),
 * le silence évapore (decay vers 0). Réutilise le pont partagé
 * stigmergyInterProcessBridge comme transport, jamais comme
 * stockage : la persistance locale vit ici (testable, avec decay).
 *
 * INVARIANT : readAttention() ordonne l'attention ("regarde là"),
 * jamais la vérité. Aucun claim, aucun statut n'en sort.
 */

const { migrateDaemonStigmergy } = require('../../db/migrations/migrateDaemonStigmergy');

const MARKER_KINDS = [
  'TEST_INSTABILITY',
  'CONTRACT_DRIFT',
  'PERFORMANCE_REGRESSION',
  'HIGH_RISK',
  'DEAD_END',
  'VERIFIED_OK'
];

const BRIDGE_TYPES = {
  HIGH_RISK: 'epistemic_high_risk',
  CONTRACT_DRIFT: 'epistemic_contradiction',
  TEST_INSTABILITY: 'epistemic_contradiction',
  DEAD_END: 'epistemic_known_failure',
  VERIFIED_OK: 'epistemic_verifier_success'
};

const MAX_INTENSITY = 10;
const EVAPORATION_FLOOR = 0.05;

function clampIntensity(value) {
  return Math.max(-MAX_INTENSITY, Math.min(MAX_INTENSITY, value));
}

function validateMarker(marker) {
  if (!marker || !marker.territoryId || !marker.scope) return false;
  return MARKER_KINDS.includes(marker.kind);
}

async function depositMarker(db, marker) {
  if (!db || !validateMarker(marker)) return { deposited: false };
  await migrateDaemonStigmergy(db);
  const amount = Number(marker.intensity) || 1;
  await db.run(
    `INSERT INTO daemon_stigmergy_markers (territory_id, scope, kind, intensity, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(territory_id, scope, kind) DO UPDATE SET
       intensity = MIN(${MAX_INTENSITY}, MAX(${-MAX_INTENSITY}, intensity + excluded.intensity)),
       updated_at = datetime('now')`,
    marker.territoryId,
    marker.scope,
    marker.kind,
    clampIntensity(amount)
  );
  return getMarker(db, marker);
}

async function depositRepellent(db, marker) {
  if (!db || !validateMarker(marker)) return { deposited: false };
  const amount = Number(marker.intensity) || 1;
  return depositMarker(db, { ...marker, intensity: -Math.abs(amount) });
}

async function getMarker(db, marker) {
  await migrateDaemonStigmergy(db);
  const row = await db.get(
    'SELECT * FROM daemon_stigmergy_markers WHERE territory_id = ? AND scope = ? AND kind = ?',
    marker.territoryId,
    marker.scope,
    marker.kind
  );
  if (!row) return { deposited: false };
  return { deposited: true, territoryId: row.territory_id, scope: row.scope, kind: row.kind, intensity: row.intensity };
}

async function evaporateMarkers(db, args) {
  if (!db || !args || !args.territoryId) return { evaporated: 0 };
  await migrateDaemonStigmergy(db);
  const rate = Math.max(0, Math.min(1, Number(args.rate) || 0.1));
  await db.run(
    'UPDATE daemon_stigmergy_markers SET intensity = intensity * ?, updated_at = datetime(?) WHERE territory_id = ?',
    1 - rate,
    new Date().toISOString(),
    args.territoryId
  );
  const res = await db.run(
    'DELETE FROM daemon_stigmergy_markers WHERE territory_id = ? AND ABS(intensity) < ?',
    args.territoryId,
    EVAPORATION_FLOOR
  );
  return { evaporated: (res && res.changes) || 0 };
}

async function readAttention(db, query) {
  if (!db || !query || !query.territoryId) return [];
  await migrateDaemonStigmergy(db);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const rows = await db.all(
    'SELECT territory_id, scope, kind, intensity FROM daemon_stigmergy_markers WHERE territory_id = ? ORDER BY ABS(intensity) DESC LIMIT ?',
    query.territoryId,
    limit
  );
  return (rows || []).map(toAttentionItem);
}

function toAttentionItem(row) {
  return { scope: row.scope, kind: row.kind, attention: Number(row.intensity.toFixed(3)) };
}

function buildBridgeSignal(marker) {
  if (!validateMarker(marker)) return null;
  const type = BRIDGE_TYPES[marker.kind] || null;
  if (!type) return null;
  return {
    type,
    locus: `territory:${marker.territoryId}:${marker.scope}`,
    intensity: clampIntensity(Number(marker.intensity) || 1),
    isRepellent: marker.kind === 'DEAD_END' || Number(marker.intensity) < 0,
    payload: { kind: marker.kind, scope: marker.scope }
  };
}

async function forwardToBridge(deps, signal) {
  if (!deps || typeof deps.depositPheromone !== 'function' || !signal) return { forwarded: false };
  try {
    await deps.depositPheromone(signal);
    return { forwarded: true, type: signal.type, locus: signal.locus };
  } catch (_) {
    return { forwarded: false };
  }
}

module.exports = {
  MARKER_KINDS,
  depositMarker,
  depositRepellent,
  getMarker,
  evaporateMarkers,
  readAttention,
  buildBridgeSignal,
  forwardToBridge
};
