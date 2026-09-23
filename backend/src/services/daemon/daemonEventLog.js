'use strict';

/**
 * Daemon Event Log — lecture du journal territorial (ADR 0034 D8).
 *
 * Pendant d'interoception : ici on lit les événements bruts pour
 * les détecteurs (fenêtre + types), là-bas on dérive des pressions.
 * created_at comparé via datetime() : le journal mélange les
 * formats espace (SQLite) et ISO (writes explicites).
 */

const { migrateDaemonEvents } = require('../../db/migrations/migrateDaemonEvents');
const { migrateDaemonEventPayload } = require('../../db/migrations/migrateDaemonEventPayload');

async function listRecentEvents(db, query) {
  if (!db || !query || !query.territoryId) return [];
  await migrateDaemonEvents(db);
  await migrateDaemonEventPayload(db);
  const since = new Date((query.now || Date.now()) - (query.windowMs || 24 * 60 * 60 * 1000)).toISOString();
  const types = query.types || [];
  if (types.length > 0) {
    const placeholders = types.map(() => '?').join(',');
    return db.all(
      `SELECT * FROM daemon_events
       WHERE territory_id = ? AND datetime(created_at) >= datetime(?)
         AND event_type IN (${placeholders})
       ORDER BY id ASC`,
      query.territoryId,
      since,
      ...types
    );
  }
  return db.all(
    `SELECT * FROM daemon_events
     WHERE territory_id = ? AND datetime(created_at) >= datetime(?)
     ORDER BY id ASC`,
    query.territoryId,
    since
  );
}

function parsePayload(event) {
  try {
    const parsed = JSON.parse(event.payload_json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

module.exports = { listRecentEvents, parsePayload };
