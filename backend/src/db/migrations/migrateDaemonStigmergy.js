'use strict';

/**
 * Migration 043 — marqueurs stigmergiques territoriaux (ADR 0034 D10).
 *
 * Une phéromone influence L'ATTENTION, jamais la vérité : cette
 * table ne contient ni claim ni statut épistémique, seulement
 * (territoire, scope, kind, intensité signée). Le pont partagé
 * inter-process (stigmergyInterProcessBridge) reste le transport
 * vers les autres agents ; ici vit la persistance locale + decay.
 */

async function migrateDaemonStigmergy(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_stigmergy_markers (
      territory_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      kind TEXT NOT NULL,
      intensity REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (territory_id, scope, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_stigmergy_territory
      ON daemon_stigmergy_markers(territory_id, intensity);
  `);
}

module.exports = { migrateDaemonStigmergy };
