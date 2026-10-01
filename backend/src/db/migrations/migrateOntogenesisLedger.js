'use strict';

/**
 * Migration 093 — journal append-only et dépenses (roadmap §P5).
 * Chaque fait saillant du projet est appendé avec un numéro
 * séquentiel par projet (rejouable depuis n'importe quel point) ;
 * les dépenses cumulées permettent le chargeback par budget.
 */

async function migrateOntogenesisLedger(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_ledger (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_ledger_project
      ON ontogenesis_ledger(project_id, seq);
    CREATE TABLE IF NOT EXISTS ontogenesis_spend (
      project_id TEXT PRIMARY KEY REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      tokens REAL NOT NULL DEFAULT 0,
      usd REAL NOT NULL DEFAULT 0,
      seconds REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { migrateOntogenesisLedger };
