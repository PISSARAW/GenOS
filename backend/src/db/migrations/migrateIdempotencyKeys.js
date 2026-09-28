'use strict';

async function migrateIdempotencyKeys(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      response_payload TEXT NOT NULL DEFAULT '{}',
      status_code INTEGER NOT NULL DEFAULT 200,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created
      ON idempotency_keys(created_at);
  `);
}

module.exports = { migrateIdempotencyKeys };
