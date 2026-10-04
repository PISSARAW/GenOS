'use strict';

async function migrateEpistemicImmuneScope(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS epistemic_immune_memory_scoped (
    scope_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    pattern_json TEXT NOT NULL,
    domain TEXT NOT NULL,
    evidence_json TEXT,
    effective_response_json TEXT,
    affinity REAL NOT NULL DEFAULT 0.4,
    failures INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    pending INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope_id, signature)
  );
  CREATE INDEX IF NOT EXISTS idx_epistemic_immune_scoped_recall
    ON epistemic_immune_memory_scoped(scope_id, affinity DESC, updated_at DESC);
  CREATE TABLE IF NOT EXISTS epistemic_immune_outcomes (
    scope_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scope_id, evidence_id),
    FOREIGN KEY (scope_id, signature)
      REFERENCES epistemic_immune_memory_scoped(scope_id, signature)
  );
  CREATE TABLE IF NOT EXISTS aeis_assurance_assemblies (
    id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, manifest_json TEXT NOT NULL,
    signature TEXT NOT NULL
  );`);
}

module.exports = { migrateEpistemicImmuneScope };
