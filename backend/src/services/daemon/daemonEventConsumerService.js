'use strict';

const { migrateDaemonEvents } = require('../../db/migrations/migrateDaemonEvents');
const { migrateDaemonEventCursor } = require('../../db/migrations/migrateDaemonEventCursor');
const eventBridge = require('./daemonEventBridgeService');

const MAX_BATCH = 100;

async function initializeCursor(context) {
  const { db, daemonId, territoryId } = context;
  await prepareTables(db);
  const existing = await db.get('SELECT * FROM daemon_event_cursors WHERE daemon_id = ?', daemonId);
  if (existing) return assertCursorTerritory(existing, territoryId);
  const latest = await db.get('SELECT COALESCE(MAX(id), 0) AS id FROM daemon_events WHERE territory_id = ?', territoryId);
  const eventId = Number(latest?.id || 0);
  await db.run(
    'INSERT INTO daemon_event_cursors (daemon_id, territory_id, last_event_id) VALUES (?, ?, ?)',
    daemonId, territoryId, eventId
  );
  return eventId;
}

function assertCursorTerritory(cursor, territoryId) {
  if (cursor.territory_id !== territoryId) {
    throw Object.assign(new Error('Daemon event cursor belongs to another territory.'), { code: 'DAEMON_CURSOR_TERRITORY_CONFLICT' });
  }
  return Number(cursor.last_event_id || 0);
}

async function prepareTables(db) {
  await migrateDaemonEvents(db);
  await migrateDaemonEventCursor(db);
}

async function pollDaemonEvents(context) {
  const cursor = await initializeCursor(context);
  const rows = await context.db.all(
    `SELECT * FROM daemon_events WHERE territory_id = ? AND id > ?
     ORDER BY id ASC LIMIT ${MAX_BATCH}`,
    context.territoryId, cursor
  );
  let lastEventId = cursor;
  for (const row of rows || []) {
    await eventBridge.processPersistedEvent(context.bridge, row);
    await advanceCursor(context.db, context.daemonId, row.id);
    lastEventId = Number(row.id);
  }
  return { polled: true, count: (rows || []).length, lastEventId };
}

async function advanceCursor(db, daemonId, eventId) {
  await db.run(
    `UPDATE daemon_event_cursors SET last_event_id = ?, updated_at = datetime('now')
     WHERE daemon_id = ? AND last_event_id < ?`,
    eventId, daemonId, eventId
  );
}

module.exports = { initializeCursor, pollDaemonEvents, MAX_BATCH };
