'use strict';

/**
 * Read-only liveness view for SentinelDaemonKeeper (ADR 0034/D23).
 * Restart decisions remain with the host/process manager.
 */

const { migrateDaemonTerritory } = require('../../db/migrations/migrateDaemonTerritory');

const DEFAULT_STALE_AFTER_MS = 90000;

function heartbeatAge(row, now) {
  const value = String(row.last_heartbeat_at || '');
  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const observed = Date.parse(timestamp);
  return Number.isFinite(observed) ? Math.max(0, now - observed) : null;
}

function healthStatus(row, age, staleAfterMs) {
  if (!row.registered_territory_id) return 'DEGRADED';
  if (age === null || age > staleAfterMs) return 'STALE';
  if (row.health !== 'HEALTHY') return 'DEGRADED';
  return 'HEALTHY';
}

function summarize(row, options) {
  const age = heartbeatAge(row, options.now);
  const status = healthStatus(row, age, options.staleAfterMs);
  return {
    daemonId: row.daemon_id,
    territoryId: row.territory_id,
    activity: row.activity,
    health: row.health,
    status,
    lastHeartbeatAt: row.last_heartbeat_at || null,
    heartbeatAgeMs: age,
    territoryRegistered: Boolean(row.registered_territory_id),
    recommendedAction: status === 'HEALTHY' ? 'none' : 'inspect-process-and-territory'
  };
}

async function listDaemonHealth(db, args = {}) {
  if (!db) return { monitored: false, daemons: [] };
  await migrateDaemonTerritory(db);
  const rows = await db.all(
    `SELECT r.*, t.id AS registered_territory_id
     FROM daemon_runtime_state r
     LEFT JOIN daemon_territories t ON t.id = r.territory_id
     ORDER BY r.daemon_id`
  );
  const options = {
    now: args.now || Date.now(),
    staleAfterMs: args.staleAfterMs || DEFAULT_STALE_AFTER_MS
  };
  return { monitored: true, daemons: (rows || []).map((row) => summarize(row, options)) };
}

module.exports = { DEFAULT_STALE_AFTER_MS, listDaemonHealth };
