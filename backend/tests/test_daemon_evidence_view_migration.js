'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const evidenceView = require('../src/db/migrations/migrateDaemonEvidenceView');
const { migrateIntegrityHardening } = require('../src/db/migrations/migrateIntegrityHardening');
const { migrationRunners } = require('../src/db/migrations/registry');

async function main() {
  const migrationOrder = migrationRunners.map((runner) => runner.name);
  assert.ok(migrationOrder.indexOf('062-integrity-hardening')
    < migrationOrder.indexOf('062b-daemon-evidence-view-repair'));
  assert.ok(migrationOrder.indexOf('062b-daemon-evidence-view-repair')
    < migrationOrder.indexOf('074-holobiont-sessions'));
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE daemon_findings (id TEXT PRIMARY KEY);
      CREATE TABLE daemon_finding_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT, finding_id TEXT NOT NULL,
        side TEXT NOT NULL, evidence_type TEXT NOT NULL, description TEXT NOT NULL,
        provenance_record_id TEXT NOT NULL, collected_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
      INSERT INTO daemon_findings (id) VALUES ('finding-1');
      INSERT INTO daemon_finding_evidence
        (finding_id, side, evidence_type, description, provenance_record_id, collected_at, metadata_json)
        VALUES ('finding-1', 'supporting', 'formal', 'proof', 'record-1', '2026-10-04', '{}');`);
    await evidenceView.run(db);
    await migrateIntegrityHardening(db);
    const balance = await db.get('SELECT * FROM v_daemon_evidence_balance WHERE finding_id = ?', 'finding-1');
    assert.equal(balance.supporting, 1);
    assert.equal(balance.total, 1);
    const foreignKeys = await db.all('PRAGMA foreign_key_list(daemon_finding_evidence)');
    assert.ok(foreignKeys.some((key) => key.table === 'daemon_findings'));

    await db.exec(`DROP VIEW v_daemon_evidence_balance;
      CREATE VIEW v_daemon_evidence_balance AS SELECT * FROM daemon_finding_evidence_old;`);
    await evidenceView.run(db);
    const repaired = await db.get('SELECT * FROM v_daemon_evidence_balance WHERE finding_id = ?', 'finding-1');
    assert.equal(repaired.total, 1);
  } finally {
    await db.close();
  }
}

main().then(() => console.log('Daemon evidence view migration: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
