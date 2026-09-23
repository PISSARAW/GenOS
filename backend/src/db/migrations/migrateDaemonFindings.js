'use strict';

/**
 * Migration 040 — findings daemon (ADR 0034 D6).
 *
 * daemon_findings : objet épistémique canonique. Preuve TYPÉE via
 * daemon_finding_evidence (side × 6 types), jamais un score global.
 * La provenance réutilise provenance_records par référence
 * (provenance_record_id texte, pas de FK croisée) — pas de
 * daemon_provenance parallèle (ADR Phase 9).
 */

async function migrateDaemonFindings(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_findings (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      claim TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_value TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OBSERVED'
        CHECK (status IN (
          'OBSERVED', 'HYPOTHESIZED', 'SUPPORTED', 'REPRODUCED',
          'CAUSALLY_SUPPORTED', 'REPAIRABLE',
          'REFUTED', 'STALE', 'EXPIRED'
        )),
      hypothesis_id TEXT,
      detector_id TEXT,
      created_by TEXT NOT NULL,
      limitations_json TEXT NOT NULL DEFAULT '[]',
      provenance_record_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_findings_territory
      ON daemon_findings(territory_id, status);
    CREATE INDEX IF NOT EXISTS idx_daemon_findings_head
      ON daemon_findings(territory_id, head_sha);

    CREATE TABLE IF NOT EXISTS daemon_finding_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      finding_id TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('supporting', 'contradicting')),
      evidence_type TEXT NOT NULL
        CHECK (evidence_type IN (
          'observational', 'experimental', 'formal',
          'causal', 'replicated', 'adversarial'
        )),
      description TEXT NOT NULL,
      provenance_record_id TEXT NOT NULL,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_finding_evidence_finding
      ON daemon_finding_evidence(finding_id, side);
  `);
}

module.exports = { migrateDaemonFindings };
