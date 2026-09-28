'use strict';

async function migrateSignalDeliveryClaims(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS signal_delivery_claims (
      signal_id TEXT NOT NULL,
      subscriber_agent_id TEXT NOT NULL,
      claim_owner TEXT NOT NULL DEFAULT '',
      lease_until_ms INTEGER NOT NULL DEFAULT 0,
      next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      dead_lettered_at_ms INTEGER,
      PRIMARY KEY (signal_id, subscriber_agent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_signal_delivery_claims_ready
      ON signal_delivery_claims (subscriber_agent_id, next_attempt_at_ms, lease_until_ms);
  `);
}

module.exports = { migrateSignalDeliveryClaims };
