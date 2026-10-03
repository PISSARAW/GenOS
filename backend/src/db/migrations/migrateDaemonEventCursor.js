'use strict';

async function migrateDaemonEventCursor(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_event_cursors (
      daemon_id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      last_event_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { migrateDaemonEventCursor };
