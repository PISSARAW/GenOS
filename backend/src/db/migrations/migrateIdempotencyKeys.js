'use strict';

async function migrateIdempotencyKeys(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      request_hash TEXT,
      response_payload TEXT NOT NULL DEFAULT '{}',
      status_code INTEGER NOT NULL DEFAULT 200,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created
      ON idempotency_keys(created_at);
  `);
  const columns = await db.all('PRAGMA table_info(idempotency_keys)');
  if (!columns.some((column) => column.name === 'request_hash')) {
    await db.exec('ALTER TABLE idempotency_keys ADD COLUMN request_hash TEXT');
  }
}

module.exports = { migrateIdempotencyKeys };
