'use strict';

/**
 * Migration 051 — contrats de dialectes relationnels (Phase 8).
 *
 * Un dialecte lie une paire d'agents dans un domaine : symboles denses
 * vers empreintes sémantiques canoniques, versionnés, fail-closed.
 * Les candidats de compilation observent les phrases récurrentes.
 */

async function migrateDialectContracts(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS dialects (
    dialect_id TEXT PRIMARY KEY, participants_key TEXT NOT NULL,
    participant_a TEXT NOT NULL, participant_b TEXT NOT NULL,
    domain TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    base_vocabulary TEXT NOT NULL DEFAULT 'genos-canonical-v3',
    common_ground_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    CHECK (participant_a < participant_b),
    CHECK (status IN ('active', 'retired'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dialects_pair ON dialects(participants_key, domain);
  CREATE TABLE IF NOT EXISTS dialect_symbols (
    dialect_id TEXT NOT NULL, symbol TEXT NOT NULL,
    semantic_fingerprint TEXT NOT NULL, canonical_meaning TEXT NOT NULL,
    payload_schema_json TEXT NOT NULL DEFAULT '{}',
    use_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0.5,
    PRIMARY KEY (dialect_id, symbol)
  );
  CREATE TABLE IF NOT EXISTS dialect_candidates (
    id TEXT PRIMARY KEY, participants_key TEXT NOT NULL, domain TEXT NOT NULL,
    phrase_hash TEXT NOT NULL, phrase_sample TEXT NOT NULL,
    last_fingerprint TEXT NOT NULL, frequency INTEGER NOT NULL DEFAULT 1,
    variance_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'proposed',
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('proposed', 'accepted', 'rejected'))
  );
  CREATE INDEX IF NOT EXISTS idx_dialect_candidates_pair ON dialect_candidates(participants_key, domain, status);`);
}

module.exports = { migrateDialectContracts };
