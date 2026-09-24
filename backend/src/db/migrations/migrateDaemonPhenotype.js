'use strict';

/**
 * Migration 054 — phénotypes écologiques daemon (ADR 0034 D16).
 *
 * Un seul archétype (ResidentDaemon), 10 phénotypes écologiques qui
 * émergent sous pression mesurée et redeviennent DORMANT quand elle
 * retombe. Jamais supprimés (réversibilité) : budded_at garde la
 * trace de la première émergence.
 */

const FAMILIES_SQL = "'security', 'contract', 'dependency', 'documentation',"
  + " 'historian', 'chaperone', 'metabolic', 'cross_repo',"
  + " 'repair', 'deep_research'";

async function migrateDaemonPhenotype(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_phenotypes (
      territory_id TEXT NOT NULL,
      family TEXT NOT NULL
        CHECK (family IN (${FAMILIES_SQL})),
      status TEXT NOT NULL DEFAULT 'DORMANT'
        CHECK (status IN ('ACTIVE', 'DORMANT')),
      pressure REAL NOT NULL DEFAULT 0,
      budded_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (territory_id, family)
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_phenotypes_status
      ON daemon_phenotypes(territory_id, status);
  `);
  await widenFamilyCheck(db);
}

async function widenFamilyCheck(db) {
  const row = await db.get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daemon_phenotypes'"
  );
  const sql = (row && row.sql) || '';
  if (sql.includes('historian')) return;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_phenotypes_v2 (
      territory_id TEXT NOT NULL,
      family TEXT NOT NULL
        CHECK (family IN (${FAMILIES_SQL})),
      status TEXT NOT NULL DEFAULT 'DORMANT'
        CHECK (status IN ('ACTIVE', 'DORMANT')),
      pressure REAL NOT NULL DEFAULT 0,
      budded_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (territory_id, family)
    );
    INSERT OR IGNORE INTO daemon_phenotypes_v2
      (territory_id, family, status, pressure, budded_at, updated_at)
      SELECT territory_id, family, status, pressure, budded_at, updated_at
      FROM daemon_phenotypes;
    DROP TABLE daemon_phenotypes;
    ALTER TABLE daemon_phenotypes_v2 RENAME TO daemon_phenotypes;
    CREATE INDEX IF NOT EXISTS idx_daemon_phenotypes_status
      ON daemon_phenotypes(territory_id, status);
  `);
}

module.exports = { migrateDaemonPhenotype };
