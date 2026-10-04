'use strict';

async function migrateMorphogenesisCapabilities(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS morph_experiment_coverage (
      receipt_id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      experiment_json TEXT NOT NULL,
      verifier_id TEXT NOT NULL,
      verification_ref TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('VERIFIED','REJECTED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS morph_coverage_scope_idx ON morph_experiment_coverage(scope_id, status);
    CREATE TABLE IF NOT EXISTS morph_attempts (
      attempt_id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      contract_json TEXT NOT NULL,
      outcome_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS morph_attempt_scope_idx ON morph_attempts(scope_id, signature);
    CREATE TABLE IF NOT EXISTS morph_temporal_observations (
      observation_id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      window_index INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OBSERVED','MISSED')),
      evidence_ref TEXT,
      UNIQUE(schedule_id, window_index)
    );
    CREATE TABLE IF NOT EXISTS morph_cambium_claims (
      claim_id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      procedure_json TEXT NOT NULL,
      verification_ref TEXT NOT NULL,
      environment_version TEXT NOT NULL,
      conditions_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('VERIFIED','QUALIFIED','UNVERIFIED'))
    );
    CREATE TABLE IF NOT EXISTS morph_cambium_witnesses (
      witness_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES morph_cambium_claims(claim_id),
      artifact_ref TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status = 'VERIFIED')
    );
    CREATE TABLE IF NOT EXISTS morph_cambium_counterexamples (
      counterexample_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES morph_cambium_claims(claim_id),
      artifact_ref TEXT NOT NULL,
      condition_json TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS morph_cambium_last_witness
      BEFORE DELETE ON morph_cambium_witnesses
      WHEN (SELECT status FROM morph_cambium_claims WHERE claim_id = OLD.claim_id) != 'UNVERIFIED'
        AND (SELECT COUNT(*) FROM morph_cambium_witnesses WHERE claim_id = OLD.claim_id) <= 1
      BEGIN SELECT RAISE(ABORT, 'last verified witness cannot be deleted'); END;
    CREATE TRIGGER IF NOT EXISTS morph_cambium_counterexample_no_delete
      BEFORE DELETE ON morph_cambium_counterexamples
      BEGIN SELECT RAISE(ABORT, 'counterexamples are immutable'); END;
    CREATE TABLE IF NOT EXISTS morph_risk_grants (
      grant_id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL,
      parent_id TEXT REFERENCES morph_risk_grants(grant_id),
      owner_node_id TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      initial_units INTEGER NOT NULL CHECK (initial_units > 0),
      available_units INTEGER NOT NULL CHECK (available_units >= 0),
      spent_units INTEGER NOT NULL CHECK (spent_units >= 0),
      delegated_units INTEGER NOT NULL CHECK (delegated_units >= 0),
      CHECK (available_units + spent_units + delegated_units <= initial_units)
    );
    CREATE TABLE IF NOT EXISTS morph_risk_tests (
      test_id TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL REFERENCES morph_risk_grants(grant_id),
      alpha_units INTEGER NOT NULL CHECK (alpha_units > 0),
      protocol_hash TEXT NOT NULL,
      evaluation_set_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('RESERVED','CONSUMED')),
      receipt_json TEXT,
      UNIQUE(evaluation_set_id)
    );
    CREATE TABLE IF NOT EXISTS morph_risk_events (
      event_id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS morph_risk_event_no_update
      BEFORE UPDATE ON morph_risk_events BEGIN SELECT RAISE(ABORT, 'risk event is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morph_risk_event_no_delete
      BEFORE DELETE ON morph_risk_events BEGIN SELECT RAISE(ABORT, 'risk event is immutable'); END;
  `);
}

module.exports = { migrateMorphogenesisCapabilities };
