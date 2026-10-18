'use strict';

async function migrateEndogenousThoughtDetections(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS endogenous_thought_detection_receipts (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      detection_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      mandate_version INTEGER,
      outcome TEXT NOT NULL CHECK(outcome IN ('candidate','rejected')),
      reason TEXT NOT NULL,
      score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
      episode_id TEXT,
      content_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      evaluated_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, detection_id)
    );
    CREATE INDEX IF NOT EXISTS idx_endogenous_detection_agent
      ON endogenous_thought_detection_receipts(
        organization_id, project_id, agent_id, evaluated_at DESC);
    CREATE TRIGGER IF NOT EXISTS endogenous_detection_no_update
      BEFORE UPDATE ON endogenous_thought_detection_receipts
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought detections are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_detection_no_delete
      BEFORE DELETE ON endogenous_thought_detection_receipts
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought detections are durable evidence'); END;
  `);
}

module.exports = { migrateEndogenousThoughtDetections };
