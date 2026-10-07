'use strict';

async function migrateScientificEvidenceLedger(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scientific_experiments (
      experiment_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      proof_level TEXT NOT NULL CHECK (proof_level IN ('L1','L2','L3','L4','L5')),
      protocol_json TEXT NOT NULL,
      environment_json TEXT NOT NULL,
      topology_refs_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scientific_claims (
      claim_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL REFERENCES scientific_experiments(experiment_id),
      statement TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      assumptions_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scientific_evidence (
      evidence_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL REFERENCES scientific_experiments(experiment_id),
      claim_id TEXT NOT NULL REFERENCES scientific_claims(claim_id),
      relation TEXT NOT NULL CHECK (relation IN ('SUPPORTS','CONTRADICTS','QUALIFIES')),
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      environment_hash TEXT,
      replication_kind TEXT CHECK (replication_kind IS NULL OR replication_kind IN ('repeatability','reproducibility','robustness','independent_replication','generalization')),
      deme_id TEXT,
      topology TEXT,
      evidence_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (claim_id, evidence_id)
    );
    CREATE INDEX IF NOT EXISTS scientific_evidence_claim_idx ON scientific_evidence(claim_id, created_at);
    CREATE INDEX IF NOT EXISTS scientific_evidence_experiment_idx ON scientific_evidence(experiment_id, created_at);
    CREATE TABLE IF NOT EXISTS scientific_assessments (
      assessment_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES scientific_claims(claim_id),
      assessment_kind TEXT NOT NULL CHECK (assessment_kind IN ('consensus','verifier')),
      position TEXT NOT NULL CHECK (position IN ('support','reject','abstain')),
      verifier_status TEXT CHECK (verifier_status IS NULL OR verifier_status IN ('verified','failed','inconclusive')),
      rationale TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS scientific_assessments_claim_idx ON scientific_assessments(claim_id, created_at);
    CREATE TABLE IF NOT EXISTS scientific_claim_events (
      event_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES scientific_claims(claim_id),
      previous_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE (claim_id, previous_hash)
    );
    CREATE INDEX IF NOT EXISTS scientific_claim_events_claim_idx ON scientific_claim_events(claim_id);
    CREATE TRIGGER IF NOT EXISTS scientific_claim_events_no_update
      BEFORE UPDATE ON scientific_claim_events BEGIN SELECT RAISE(ABORT, 'scientific claim events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS scientific_claim_events_no_delete
      BEFORE DELETE ON scientific_claim_events BEGIN SELECT RAISE(ABORT, 'scientific claim events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS scientific_claims_no_update
      BEFORE UPDATE ON scientific_claims BEGIN SELECT RAISE(ABORT, 'scientific claims are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS scientific_claims_no_delete
      BEFORE DELETE ON scientific_claims BEGIN SELECT RAISE(ABORT, 'scientific claims are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS scientific_evidence_no_update
      BEFORE UPDATE ON scientific_evidence BEGIN SELECT RAISE(ABORT, 'scientific evidence is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS scientific_evidence_no_delete
      BEFORE DELETE ON scientific_evidence BEGIN SELECT RAISE(ABORT, 'scientific evidence is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS scientific_assessments_no_update
      BEFORE UPDATE ON scientific_assessments BEGIN SELECT RAISE(ABORT, 'scientific assessments are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS scientific_assessments_no_delete
      BEFORE DELETE ON scientific_assessments BEGIN SELECT RAISE(ABORT, 'scientific assessments are immutable'); END;
  `);
}

module.exports = { migrateScientificEvidenceLedger };
