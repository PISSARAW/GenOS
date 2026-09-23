'use strict';

/**
 * Migration 037 — territoires des daemons résidents (ADR 0034, Phase 1).
 *
 * Tables :
 *  - daemon_territories : identité + scoping repo/ref/path/commit.
 *    La connaissance est commit-aware : head_sha ancre toute
 *    observation ; un changement de HEAD invalide, jamais ne
 *    transporte silencieusement.
 *  - daemon_runtime_state : état éphémère du ResidentDaemonRuntime
 *    (activité, santé, révisions cognitives Hayflick) par daemon.
 *
 * Ne crée PAS les tables findings/graph/handoff ici (phases D5/D6/D11).
 * Réutilise agents, telemetry_events, provenance_records, signal_blobs,
 * snapshots, memory et tables Natural Search quand les concepts
 * correspondent déjà (ADR 0034 Phase 24).
 */

async function migrateDaemonTerritory(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_territories (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      repo_identity TEXT NOT NULL,
      root_path TEXT NOT NULL,
      scope_path TEXT NOT NULL DEFAULT '/',
      ref TEXT NOT NULL DEFAULT 'main',
      head_sha TEXT NOT NULL,
      parent_territory_id TEXT,
      state TEXT NOT NULL DEFAULT 'BOOTSTRAPPING'
        CHECK (state IN (
          'BOOTSTRAPPING', 'SURVEYING', 'ACTIVE',
          'DORMANT', 'STALE', 'DEGRADED', 'APOPTOTIC'
        )),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_observed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_territory_id)
        REFERENCES daemon_territories(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_territories_repo
      ON daemon_territories(repo_identity, ref);
    CREATE INDEX IF NOT EXISTS idx_daemon_territories_workspace
      ON daemon_territories(workspace_id, scope_path);
    CREATE INDEX IF NOT EXISTS idx_daemon_territories_parent
      ON daemon_territories(parent_territory_id);
    CREATE INDEX IF NOT EXISTS idx_daemon_territories_state
      ON daemon_territories(state);

    CREATE TABLE IF NOT EXISTS daemon_runtime_state (
      daemon_id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      activity TEXT NOT NULL DEFAULT 'BOOTSTRAPPING'
        CHECK (activity IN (
          'BOOTSTRAPPING', 'SURVEYING', 'DORMANT', 'FOCUSED',
          'INVESTIGATING', 'VERIFYING', 'REPORTING'
        )),
      health TEXT NOT NULL DEFAULT 'HEALTHY'
        CHECK (health IN (
          'HEALTHY', 'STRESSED', 'DEGRADED', 'SENESCENT', 'APOPTOTIC'
        )),
      cognitive_revisions INTEGER NOT NULL DEFAULT 0,
      last_heartbeat_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (territory_id)
        REFERENCES daemon_territories(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_runtime_territory
      ON daemon_runtime_state(territory_id);
    CREATE INDEX IF NOT EXISTS idx_daemon_runtime_health
      ON daemon_runtime_state(health, activity);
  `);
}

module.exports = { migrateDaemonTerritory };
