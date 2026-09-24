'use strict';

/**
 * Migration 056 — registre de suspects du Reconciler (ADR 0034 D13/D22).
 *
 * Autophagie à deux vitesses : les tables possédées par les daemons
 * (findings, handoffs, graphe, repair) sont mutées directement avec
 * reçu ; les ressources étrangères (agents, workspaces, capsules)
 * ne sont jamais mutées — elles sont fichées SUSPECT ici, avec
 * grace period et résolution automatique quand la liveness revient.
 * Pipeline : detect → mark suspect → liveness → grace → receipt.
 */

async function migrateDaemonSuspects(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_reconcile_suspects (
      territory_id TEXT NOT NULL,
      kind TEXT NOT NULL
        CHECK (kind IN ('blocked-agent', 'stale-runtime', 'orphan-workspace', 'stuck-capsule', 'abandoned-branch')),
      ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUSPECT'
        CHECK (status IN ('SUSPECT', 'RESOLVED')),
      sightings INTEGER NOT NULL DEFAULT 1,
      detail_json TEXT NOT NULL DEFAULT '{}',
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (territory_id, kind, ref)
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_suspects_status
      ON daemon_reconcile_suspects(territory_id, status, kind);
  `);
}

module.exports = { migrateDaemonSuspects };
