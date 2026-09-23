'use strict';

/**
 * Migration 054 — phénotypes écologiques daemon (ADR 0034 D16).
 *
 * Pas de daemons spécialisés prédéfinis : le phénotype ÉMERGE de la
 * pression territoriale mesurée et redevient DORMANT quand elle
 * retombe. Jamais supprimé (réversibilité) : budded_at garde la
 * trace de la première émergence.
 */

async function migrateDaemonPhenotype(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_phenotypes (
      territory_id TEXT NOT NULL,
      family TEXT NOT NULL
        CHECK (family IN ('security', 'contract', 'dependency', 'documentation')),
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
}

module.exports = { migrateDaemonPhenotype };
