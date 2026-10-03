'use strict';

/**
 * Projection Outbox — the missing piece for GenOS polyglot persistence.
 *
 * Pattern: transactional outbox.
 *   1. Service writes canonical data in SQLite (inside a transaction)
 *   2. Same transaction appends a projection_event
 *   3. GraphProjector / AnalyticsProjector / SearchProjector consume events async
 *
 * If a projection fails, the canonical write is NOT rolled back.
 * The projector replays from the last consumed sequence on restart.
 *
 * Tables:
 *   projection_events      — append-only event log
 *   projection_consumers   — per-consumer cursor
 *   projection_failures    — dead-letter queue
 *   projection_rebuilds    — rebuild audit trail
 */

const { randomUUID } = require('crypto');
const { getDatabase, withTransaction } = require('../../db');

async function ensureOutboxTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS projection_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      organization_id TEXT,
      project_id TEXT,
      created_at TEXT NOT NULL,
      graph_projected_at TEXT,
      analytics_projected_at TEXT,
      search_projected_at TEXT,
      CHECK (json_valid(payload_json))
    );
    CREATE INDEX IF NOT EXISTS idx_projection_events_sequence ON projection_events(sequence);
    CREATE INDEX IF NOT EXISTS idx_projection_events_aggregate ON projection_events(aggregate_type, aggregate_id);
    CREATE INDEX IF NOT EXISTS idx_projection_events_unconsumed ON projection_events(sequence) WHERE graph_projected_at IS NULL;

    CREATE TABLE IF NOT EXISTS projection_consumers (
      consumer_name TEXT PRIMARY KEY,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projection_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      consumer_name TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_stack TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_projection_failures_unresolved ON projection_failures(resolved_at) WHERE resolved_at IS NULL;

    CREATE TABLE IF NOT EXISTS projection_rebuilds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_name TEXT NOT NULL,
      from_sequence INTEGER NOT NULL,
      to_sequence INTEGER NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
      error_message TEXT
    );
  `);
}

/**
 * Append a projection event inside the current transaction.
 * Pass the transaction handle as second arg to stay atomic,
 * otherwise falls back to the shared database handle.
 */
async function appendProjectionEvent(event, dbHandle) {
  const db = dbHandle || await getDatabase();
  const {
    aggregate_type, aggregate_id, event_type, payload_json,
    organization_id, project_id,
  } = event;
  const eventId = `evt_${randomUUID()}`;
  const payload = JSON.stringify(payload_json || {});
  await db.run(
    `INSERT INTO projection_events (event_id, aggregate_type, aggregate_id, event_type, payload_json, organization_id, project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [eventId, aggregate_type, aggregate_id, event_type, payload, organization_id || null, project_id || null, new Date().toISOString()]
  );
  return eventId;
}

/**
 * Get unconsumed events for a consumer, starting after its cursor.
 */
async function getUnconsumedEvents(consumerName, limit = 100) {
  const db = await getDatabase();
  const consumer = await db.get(
    'SELECT last_sequence FROM projection_consumers WHERE consumer_name = ?',
    [consumerName]
  );
  const lastSeq = consumer ? consumer.last_sequence : 0;
  const events = await db.all(
    `SELECT * FROM projection_events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?`,
    [lastSeq, limit]
  );
  return { events, lastSequence: lastSeq };
}

/**
 * Mark events as consumed by a consumer (advance cursor).
 */
async function markConsumed(consumerName, upToSequence) {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO projection_consumers (consumer_name, last_sequence, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(consumer_name) DO UPDATE SET last_sequence = MAX(last_sequence, excluded.last_sequence), updated_at = excluded.updated_at`,
    [consumerName, upToSequence, new Date().toISOString()]
  );
}

/**
 * Mark a single event as projected by a specific target.
 */
const PROJECTED_TARGETS = new Set(['graph', 'analytics', 'search']);
async function markProjected(eventId, target) {
  if (!PROJECTED_TARGETS.has(target)) throw new Error(`Unknown projection target '${target}'.`);
  const db = await getDatabase();
  const column = `${target}_projected_at`;
  await db.run(
    `UPDATE projection_events SET ${column} = ? WHERE event_id = ?`,
    [new Date().toISOString(), eventId]
  );
}

/**
 * Record a projection failure for dead-letter handling.
 */
async function recordProjectionFailure(eventId, consumerName, error) {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO projection_failures (event_id, consumer_name, error_message, error_stack)
     VALUES (?, ?, ?, ?)`,
    [eventId, consumerName, error.message, error.stack]
  );
}

/**
 * Get unresolved failures for retry, scoped to one consumer.
 * A projector must only retry and resolve its own failures.
 */
async function getUnresolvedFailures(consumerName, limit = 50) {
  const db = await getDatabase();
  if (!consumerName || typeof consumerName !== 'string') return [];
  return db.all(
    `SELECT * FROM projection_failures WHERE resolved_at IS NULL AND consumer_name = ? ORDER BY created_at ASC LIMIT ?`,
    [consumerName, limit]
  );
}

/**
 * Mark a failure as resolved, only if it belongs to the consumer.
 */
async function resolveFailure(failureId, consumerName) {
  const db = await getDatabase();
  if (!consumerName || typeof consumerName !== 'string') return;
  await db.run(
    `UPDATE projection_failures SET resolved_at = ? WHERE id = ? AND consumer_name = ? AND resolved_at IS NULL`,
    [new Date().toISOString(), failureId, consumerName]
  );
}

/**
 * Start a rebuild for a consumer. Returns the rebuild row id.
 */
async function startRebuild(consumerName, fromSequence) {
  const db = await getDatabase();
  const result = await db.run(
    `INSERT INTO projection_rebuilds (consumer_name, from_sequence, to_sequence, status)
     VALUES (?, ?, ?, 'running')`,
    [consumerName, fromSequence, fromSequence]
  );
  return result && result.lastID !== undefined ? result.lastID : result;
}

/**
 * Complete a rebuild.
 */
async function completeRebuild(rebuildId, result) {
  const db = await getDatabase();
  await db.run(
    `UPDATE projection_rebuilds SET to_sequence = ?, completed_at = ?, status = ?, error_message = ?
     WHERE id = ?`,
    [result.toSequence, new Date().toISOString(), result.status || 'failed', result.errorMessage || null, rebuildId]
  );
}

/**
 * Get projection status summary.
 */
async function getProjectionStatus() {
  const db = await getDatabase();
  const totalEvents = await db.get('SELECT COUNT(*) AS count FROM projection_events');
  const unconsumedGraph = await db.get('SELECT COUNT(*) AS count FROM projection_events WHERE graph_projected_at IS NULL');
  const unconsumedAnalytics = await db.get('SELECT COUNT(*) AS count FROM projection_events WHERE analytics_projected_at IS NULL');
  const unconsumedSearch = await db.get('SELECT COUNT(*) AS count FROM projection_events WHERE search_projected_at IS NULL');
  const unresolvedFailures = await db.get('SELECT COUNT(*) AS count FROM projection_failures WHERE resolved_at IS NULL');
  const consumers = await db.all('SELECT consumer_name, last_sequence, updated_at FROM projection_consumers ORDER BY consumer_name');
  return {
    totalEvents: totalEvents ? totalEvents.count : 0,
    unconsumedGraph: unconsumedGraph ? unconsumedGraph.count : 0,
    unconsumedAnalytics: unconsumedAnalytics ? unconsumedAnalytics.count : 0,
    unconsumedSearch: unconsumedSearch ? unconsumedSearch.count : 0,
    unresolvedFailures: unresolvedFailures ? unresolvedFailures.count : 0,
    consumers,
  };
}

module.exports = {
  ensureOutboxTables,
  appendProjectionEvent,
  getUnconsumedEvents,
  markConsumed,
  markProjected,
  recordProjectionFailure,
  getUnresolvedFailures,
  resolveFailure,
  startRebuild,
  completeRebuild,
  getProjectionStatus,
};
