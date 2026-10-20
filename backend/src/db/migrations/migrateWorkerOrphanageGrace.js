'use strict';

/**
 * Migration 109 — sas d'orphelinat pour workers (ADR 0035).
 *
 * Table de grâce transitoire : un worker orphelin y est admis avec son
 * budget gelé et un TTL impitoyable. Trois issues possibles :
 * réclamation par un nouveau parent (RECLAIMED → ACTIVE),
 * expiration du TTL (EXPIRED → TERMINÉ), ou jamais d'issue (SUSPECT
 * résolu par le sweep du reconciler).
 *
 * Pas de mutation du worker hors de ce sas ; seul le ResidentDaemon
 * détient le lease d'admission, de réclamation et de réapér.
 */

async function migrateWorkerOrphanageGrace(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS worker_orphanage_grace (
      worker_id TEXT NOT NULL PRIMARY KEY,
      territory_id TEXT NOT NULL,
      former_parent_id TEXT NOT NULL,
      orphaned_at TEXT NOT NULL DEFAULT (datetime('now')),
      grace_expires_at TEXT NOT NULL,
      budget_frozen_at INTEGER NOT NULL,
      reclaim_proof TEXT,
      reclaimed_by TEXT,
      status TEXT NOT NULL DEFAULT 'SUSPECT'
        CHECK (status IN ('SUSPECT', 'RECLAIMED', 'EXPIRED'))
    );
    CREATE INDEX IF NOT EXISTS idx_worker_orphanage_status
      ON worker_orphanage_grace(status, grace_expires_at);
    CREATE INDEX IF NOT EXISTS idx_worker_orphanage_territory
      ON worker_orphanage_grace(territory_id, status);
  `);
}

module.exports = { migrateWorkerOrphanageGrace };
