'use strict';

async function migrateProductionHealingEvidence(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS production_healing_candidate_results (
      campaign_id TEXT NOT NULL REFERENCES production_healing_campaigns(id) ON DELETE RESTRICT,
      candidate_id TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      result_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(campaign_id, candidate_id)
    );
    CREATE TABLE IF NOT EXISTS production_healing_verifications (
      campaign_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      verifier_id TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK(verdict IN ('verified','refuted','inconclusive')),
      result_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      receipt_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(campaign_id, candidate_id, verifier_id),
      FOREIGN KEY(campaign_id, candidate_id)
        REFERENCES production_healing_candidate_results(campaign_id, candidate_id)
        ON DELETE RESTRICT
    );
    CREATE TRIGGER IF NOT EXISTS production_healing_results_no_update
      BEFORE UPDATE ON production_healing_candidate_results
      BEGIN SELECT RAISE(ABORT, 'production healing results are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS production_healing_results_no_delete
      BEFORE DELETE ON production_healing_candidate_results
      BEGIN SELECT RAISE(ABORT, 'production healing results are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS production_healing_verifications_no_update
      BEFORE UPDATE ON production_healing_verifications
      BEGIN SELECT RAISE(ABORT, 'production healing verifications are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS production_healing_verifications_no_delete
      BEFORE DELETE ON production_healing_verifications
      BEGIN SELECT RAISE(ABORT, 'production healing verifications are immutable'); END;
  `);
}

module.exports = { migrateProductionHealingEvidence };
