'use strict';

async function ensureColumn(db, column, definition) {
  const columns = await db.all('PRAGMA table_info(genome_decisions)');
  if (!columns.some((item) => item.name === column)) {
    await db.run(`ALTER TABLE genome_decisions ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateDecisionEvidenceBinding(db) {
  await ensureColumn(db, 'evidence_refs_json', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(db, 'evidence_status', "TEXT NOT NULL DEFAULT 'provisional'");
  await ensureColumn(db, 'provenance_record_id', 'TEXT');
  await ensureColumn(db, 'provenance_hash', 'TEXT');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_genome_decisions_provenance_hash ON genome_decisions(provenance_hash)');
}

module.exports = { migrateDecisionEvidenceBinding };
