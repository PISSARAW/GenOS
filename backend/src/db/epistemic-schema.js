'use strict';

/**
 * Schema extension: epistemic surfaces (§01).
 *
 * Tables:
 *  - claim_types_registry        : provable typed claim taxonomy + causal metadata
 *  - epistemic_debts             : unresolved claims / provisional positions ledger
 *  - epistemic_trends            : decaying confidence per claim/subject
 *  - evidence_claims             : typed evidence contract instances
 *
 * This extension is loaded by schema.js via addOptionalColumns + a registry
 * migration when present. Absent when the DB predates this extension.
 */

const CREATE_CLAIM_TYPES_REGISTRY_SQL = `
CREATE TABLE IF NOT EXISTS claim_types_registry (
    type TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    registersAs TEXT NOT NULL,
    requirement TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const CREATE_EVIDENCE_CLAIMS_SQL = `
CREATE TABLE IF NOT EXISTS evidence_claims (
    id TEXT PRIMARY KEY,
    claim_type TEXT NOT NULL,
    subject TEXT,
    statement TEXT,
    probability REAL,
    evidence_quality REAL,
    calibrated_confidence REAL,
    stakes TEXT,
    phase TEXT,
    debt_created INTEGER NOT NULL DEFAULT 0,
    accepted INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (created_by) REFERENCES agents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS evidence_claims_subject_idx ON evidence_claims(subject);
CREATE INDEX IF NOT EXISTS evidence_claims_type_idx ON evidence_claims(claim_type);
CREATE INDEX IF NOT EXISTS evidence_claims_accepted_idx ON evidence_claims(accepted, created_at);
CREATE INDEX IF NOT EXISTS evidence_claims_phase_idx ON evidence_claims(phase);
`;

const CREATE_EPIDEMIC_DEBTS_SQL = `
CREATE TABLE IF NOT EXISTS epistemic_debts (
    id TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    subject TEXT,
    claim_type TEXT,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at DATETIME,
    resolution TEXT
);
CREATE INDEX IF NOT EXISTS epistemic_debts_subject_idx ON epistemic_debts(subject);
CREATE INDEX IF NOT EXISTS epistemic_debts_resolved_idx ON epistemic_debts(resolved);
CREATE INDEX IF NOT EXISTS epistemic_debts_severity_idx ON epistemic_debts(severity);
`;

const CREATE_EPIDEMIC_TRENDS_SQL = `
CREATE TABLE IF NOT EXISTS epigenetic_trends (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    base_quality REAL NOT NULL,
    curve TEXT NOT NULL DEFAULT 'short',
    tails INTEGER NOT NULL DEFAULT 0,
    last_comment_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS epigenetic_trends_subject_idx ON epigenetic_trends(subject);
`;

const CREATE_EPIDEMIC_TRENDS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS epigenetic_trends_subject_idx ON epigenetic_trends(subject);
`;

/**
 * Idempotent schema extension — safe to call on every startup.
 * Uses addOptionalColumns-style resilience: failures are non-fatal.
 */
async function applyV01EpistemicMigration(db) {
  const statements = [
    CREATE_CLAIM_TYPES_REGISTRY_SQL,
    CREATE_EVIDENCE_CLAIMS_SQL,
    CREATE_EPIDEMIC_DEBTS_SQL,
    CREATE_EPIDEMIC_TRENDS_SQL,
  ];
  for (const sql of statements) {
    try {
      await db.exec(sql);
    } catch (err) {
      // Non-fatal: schema may already exist, or DB is read-only in tests.
      console.warn('[Epistemic] schema extension skipped:', err.message);
    }
  }
  // Seed claim type registry rows if absent — idempotent.
  for (const [type, desc, registersAs] of [
    ['factual', 'Empirically grounded assertion; verifiable against observation/test/replay.', 'evidence'],
    ['normative', 'Value-loaded assertion about what should hold (rule/preference/obligation).', 'norm'],
    ['preference', 'Agent/stakeholder preference, not universal.', 'preference'],
    ['belief', 'Held position without full verification; provisional until corroborated.', 'belief'],
  ]) {
    try {
      await db.run(
        `INSERT OR IGNORE INTO claim_types_registry (type, description, registersAs) VALUES (?, ?, ?)`,
        type,
        desc,
        registersAs,
      );
    } catch (_) {}
  }
}

// Also export the index creation (idempotent) in case caller wants them separately.
async function applyV01EpistemicIndexes(db) {
  try {
    await db.exec(CREATE_EPIDEMIC_TRENDS_INDEXES_SQL);
  } catch (_) {}
}

module.exports = {
  applyV01EpistemicMigration,
  applyV01EpistemicIndexes,
  CREATE_CLAIM_TYPES_REGISTRY_SQL,
  CREATE_EVIDENCE_CLAIMS_SQL,
  CREATE_EPIDEMIC_DEBTS_SQL,
  CREATE_EPIDEMIC_TRENDS_SQL,
};
