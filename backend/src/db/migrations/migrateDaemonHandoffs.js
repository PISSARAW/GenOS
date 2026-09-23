'use strict';

/**
 * Migration 044 — handoffs daemon (ADR 0034 D11).
 *
 * Un handoff est un TerritoryBrief compilé et persisté, récupéré
 * à la demande par l'orchestrateur. Le Signal Plane ne transporte
 * que le signal zero-text TERRITORY_BRIEF_READY (briefId,
 * territoryId, headSha, relevanceClass) — jamais le dossier.
 */

async function migrateDaemonHandoffs(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_handoffs (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      mission TEXT,
      relevance_class TEXT NOT NULL DEFAULT 'low'
        CHECK (relevance_class IN ('low', 'medium', 'high')),
      status TEXT NOT NULL DEFAULT 'READY'
        CHECK (status IN ('READY', 'CONSUMED', 'EXPIRED')),
      brief_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_handoffs_territory
      ON daemon_handoffs(territory_id, status, created_at);
  `);
}

module.exports = { migrateDaemonHandoffs };
