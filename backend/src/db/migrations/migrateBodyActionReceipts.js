'use strict';

async function migrateBodyActionReceipts(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS body_action_receipts (
    action_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    effector_id TEXT NOT NULL,
    authority_hash TEXT NOT NULL,
    prediction_json TEXT NOT NULL,
    outcome_json TEXT,
    phase TEXT NOT NULL CHECK(phase IN ('predicted','observed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    observed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_body_action_agent_run
    ON body_action_receipts(agent_id, run_id, phase);`);
}

module.exports = { migrateBodyActionReceipts };
