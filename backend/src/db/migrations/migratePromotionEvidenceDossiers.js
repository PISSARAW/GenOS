'use strict';

async function migratePromotionEvidenceDossiers(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS promotion_evidence_dossiers (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    replay_receipt_id TEXT NOT NULL,
    claims_json TEXT NOT NULL,
    policy_json TEXT NOT NULL,
    authority_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open','sealed')),
    disposition TEXT CHECK(disposition IN ('promote','reject','quarantine','escalate')),
    decision_receipt_json TEXT,
    decision_receipt_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sealed_at TEXT,
    FOREIGN KEY(run_id) REFERENCES strategy_execution_runs(id),
    FOREIGN KEY(replay_receipt_id) REFERENCES causal_state_replay_receipts(id)
  );
  CREATE INDEX IF NOT EXISTS idx_promotion_evidence_dossiers_run
    ON promotion_evidence_dossiers(run_id, created_at);

  CREATE TABLE IF NOT EXISTS promotion_evidence_items (
    id TEXT PRIMARY KEY,
    dossier_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('supporting','refuting','context')),
    status TEXT NOT NULL CHECK(status IN ('verified','rejected','inconclusive')),
    source_ref TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    producer_id TEXT NOT NULL,
    verifier_id TEXT NOT NULL,
    independent INTEGER NOT NULL CHECK(independent IN (0,1)),
    payload_json TEXT NOT NULL,
    evidence_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(dossier_id) REFERENCES promotion_evidence_dossiers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_promotion_evidence_items_dossier
    ON promotion_evidence_items(dossier_id, claim_id);

  CREATE TABLE IF NOT EXISTS promotion_falsification_attempts (
    id TEXT PRIMARY KEY,
    dossier_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    method TEXT NOT NULL,
    verifier_id TEXT NOT NULL,
    independent INTEGER NOT NULL CHECK(independent IN (0,1)),
    outcome TEXT NOT NULL CHECK(outcome IN ('survived','refuted','inconclusive')),
    counterexample_json TEXT NOT NULL,
    attempt_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(dossier_id) REFERENCES promotion_evidence_dossiers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_promotion_falsification_dossier
    ON promotion_falsification_attempts(dossier_id, claim_id);

  CREATE TRIGGER IF NOT EXISTS promotion_evidence_dossiers_identity_no_update
    BEFORE UPDATE OF id, run_id, agent_id, replay_receipt_id, claims_json,
      policy_json, authority_hash, created_at
    ON promotion_evidence_dossiers
    BEGIN SELECT RAISE(ABORT, 'promotion evidence dossier identity is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS promotion_evidence_dossiers_sealed_no_update
    BEFORE UPDATE ON promotion_evidence_dossiers WHEN OLD.status = 'sealed'
    BEGIN SELECT RAISE(ABORT, 'sealed promotion evidence dossier is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS promotion_evidence_dossiers_no_delete
    BEFORE DELETE ON promotion_evidence_dossiers
    BEGIN SELECT RAISE(ABORT, 'promotion evidence dossiers are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS promotion_evidence_items_no_update
    BEFORE UPDATE ON promotion_evidence_items
    BEGIN SELECT RAISE(ABORT, 'promotion evidence items are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS promotion_evidence_items_no_delete
    BEFORE DELETE ON promotion_evidence_items
    BEGIN SELECT RAISE(ABORT, 'promotion evidence items are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS promotion_falsification_no_update
    BEFORE UPDATE ON promotion_falsification_attempts
    BEGIN SELECT RAISE(ABORT, 'promotion falsification attempts are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS promotion_falsification_no_delete
    BEFORE DELETE ON promotion_falsification_attempts
    BEGIN SELECT RAISE(ABORT, 'promotion falsification attempts are immutable'); END;`);
}

module.exports = { migratePromotionEvidenceDossiers };
