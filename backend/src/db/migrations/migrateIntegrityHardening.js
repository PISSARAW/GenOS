'use strict';

async function migrateIntegrityHardening(db) {
  const existing = await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='daemon_finding_evidence'"
  );
  if (!existing.length) {
    await db.exec(`CREATE TABLE daemon_finding_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      finding_id TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('supporting', 'contradicting')),
      evidence_type TEXT NOT NULL CHECK (evidence_type IN ('observational','experimental','formal','causal','replicated','adversarial')),
      description TEXT NOT NULL,
      provenance_record_id TEXT NOT NULL,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      CHECK (json_valid(metadata_json)),
      FOREIGN KEY (finding_id) REFERENCES daemon_findings(id) ON DELETE CASCADE
    )`);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_finding_evidence_finding ON daemon_finding_evidence(finding_id, side)');
    return;
  }
  const fkRows = await db.all('PRAGMA foreign_key_list(daemon_finding_evidence)');
  const hasFK = fkRows.some((r) => r.table === 'daemon_findings');
  if (hasFK) return;
  await db.exec('BEGIN IMMEDIATE');
  try {
    await db.exec('ALTER TABLE daemon_finding_evidence RENAME TO daemon_finding_evidence_old');
    await db.exec(`CREATE TABLE daemon_finding_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      finding_id TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('supporting', 'contradicting')),
      evidence_type TEXT NOT NULL CHECK (evidence_type IN ('observational','experimental','formal','causal','replicated','adversarial')),
      description TEXT NOT NULL,
      provenance_record_id TEXT NOT NULL,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      CHECK (json_valid(metadata_json)),
      FOREIGN KEY (finding_id) REFERENCES daemon_findings(id) ON DELETE CASCADE
    )`);
    await db.exec('INSERT INTO daemon_finding_evidence SELECT * FROM daemon_finding_evidence_old');
    await db.exec('DROP TABLE daemon_finding_evidence_old');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_finding_evidence_finding ON daemon_finding_evidence(finding_id, side)');
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { migrateIntegrityHardening };
