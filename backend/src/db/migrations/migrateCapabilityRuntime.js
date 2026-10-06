'use strict';

async function migrateCapabilityRuntime(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS morph_capability_artifacts (
      artifact_ref TEXT PRIMARY KEY, scope_id TEXT NOT NULL, kind TEXT NOT NULL,
      content_json TEXT NOT NULL, digest TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS morph_artifact_scope ON morph_capability_artifacts(scope_id, kind);
    CREATE TRIGGER IF NOT EXISTS morph_artifact_no_update BEFORE UPDATE ON morph_capability_artifacts
      BEGIN SELECT RAISE(ABORT, 'artifact is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morph_artifact_no_delete BEFORE DELETE ON morph_capability_artifacts
      BEGIN SELECT RAISE(ABORT, 'artifact is immutable'); END;
    CREATE TABLE IF NOT EXISTS morph_experiment_waves (
      wave_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, contracts_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('OPEN','SEALED')), receipt_json TEXT
    );
    CREATE TABLE IF NOT EXISTS morph_temporal_missed_ranges (
      schedule_id TEXT NOT NULL, first_window INTEGER NOT NULL, last_window INTEGER NOT NULL,
      CHECK(last_window >= first_window), PRIMARY KEY(schedule_id, first_window)
    );
    CREATE TABLE IF NOT EXISTS morph_cambium_links (
      parent_id TEXT REFERENCES morph_cambium_claims(claim_id),
      child_id TEXT REFERENCES morph_cambium_claims(claim_id), PRIMARY KEY(parent_id, child_id),
      CHECK(parent_id != child_id)
    );
    CREATE TABLE IF NOT EXISTS morph_cambium_replays (
      replay_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, claim_id TEXT NOT NULL,
      result_json TEXT NOT NULL, artifact_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS morph_risk_scopes (
      scope_id TEXT PRIMARY KEY, root_id TEXT UNIQUE NOT NULL REFERENCES morph_risk_grants(grant_id)
    );
    CREATE TABLE IF NOT EXISTS morph_risk_missions (
      mission_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES morph_risk_scopes(scope_id)
    );
    CREATE TRIGGER IF NOT EXISTS morph_mission_scope_no_update BEFORE UPDATE ON morph_risk_missions
      BEGIN SELECT RAISE(ABORT, 'mission risk scope is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morph_mission_scope_no_delete BEFORE DELETE ON morph_risk_missions
      BEGIN SELECT RAISE(ABORT, 'mission risk scope is immutable'); END;
    CREATE TABLE IF NOT EXISTS morph_risk_nodes (
      node_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES morph_risk_scopes(scope_id),
      topology TEXT NOT NULL, grants_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('ACTIVE','ARCHIVED','MERGED')), revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS morph_risk_allocators (
      grant_id TEXT PRIMARY KEY REFERENCES morph_risk_grants(grant_id),
      ratio REAL NOT NULL CHECK(ratio > 0 AND ratio < 1), artifact_ref TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS morph_allocator_no_update BEFORE UPDATE ON morph_risk_allocators
      BEGIN SELECT RAISE(ABORT, 'allocator is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morph_allocator_no_delete BEFORE DELETE ON morph_risk_allocators
      BEGIN SELECT RAISE(ABORT, 'allocator is immutable'); END;
    CREATE TABLE IF NOT EXISTS morph_statistical_reservations (
      test_id TEXT PRIMARY KEY REFERENCES morph_risk_tests(test_id), reservation_ref TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS morph_reservation_no_update BEFORE UPDATE ON morph_statistical_reservations
      BEGIN SELECT RAISE(ABORT, 'reservation is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morph_reservation_no_delete BEFORE DELETE ON morph_statistical_reservations
      BEGIN SELECT RAISE(ABORT, 'reservation is immutable'); END;
    CREATE TABLE IF NOT EXISTS morph_statistical_protocols (
      protocol_hash TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES morph_risk_scopes(scope_id),
      verifier_id TEXT NOT NULL, protocol_json TEXT NOT NULL, artifact_ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS morph_protocol_no_update BEFORE UPDATE ON morph_statistical_protocols
      BEGIN SELECT RAISE(ABORT, 'protocol is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morph_protocol_no_delete BEFORE DELETE ON morph_statistical_protocols
      BEGIN SELECT RAISE(ABORT, 'protocol is immutable'); END;
    CREATE TABLE IF NOT EXISTS morph_statistical_samples (
      sample_id TEXT PRIMARY KEY, test_id TEXT NOT NULL REFERENCES morph_risk_tests(test_id),
      evidence_ref TEXT UNIQUE NOT NULL, unit_hash TEXT UNIQUE NOT NULL, sample_json TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS morph_sample_no_update BEFORE UPDATE ON morph_statistical_samples
      BEGIN SELECT RAISE(ABORT, 'sample is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morph_sample_no_delete BEFORE DELETE ON morph_statistical_samples
      BEGIN SELECT RAISE(ABORT, 'sample is immutable'); END;
  `);
}
module.exports = { migrateCapabilityRuntime };
