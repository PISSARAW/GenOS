'use strict';

async function migrateMissionEpisodes(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mission_episodes (
      episode_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      organism_id TEXT,
      organism_revision TEXT NOT NULL,
      epigenome_revision TEXT,
      habitat_id TEXT,
      habitat_revision INTEGER CHECK (habitat_revision IS NULL OR habitat_revision > 0),
      orchestrator_id TEXT,
      root_thread_id TEXT,
      status TEXT NOT NULL DEFAULT 'embryonic' CHECK (status IN (
        'embryonic', 'active', 'quiescent', 'completed', 'failed', 'cancelled'
      )),
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE,
      UNIQUE (episode_id, mission_id, organization_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mission_episodes_scope
      ON mission_episodes(organization_id, project_id, mission_id, created_at);
    CREATE TRIGGER IF NOT EXISTS mission_episode_scope_guard
      BEFORE INSERT ON mission_episodes
      WHEN EXISTS (
        SELECT 1 FROM mission_episodes existing
        WHERE existing.mission_id = NEW.mission_id
          AND (existing.organization_id != NEW.organization_id
            OR existing.project_id != NEW.project_id)
      )
      BEGIN SELECT RAISE(ABORT, 'MISSION_EPISODE_SCOPE_DENIED'); END;

    CREATE TABLE IF NOT EXISTS cell_threads (
      thread_id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      parent_thread_id TEXT,
      worker_id TEXT NOT NULL,
      cell_kind TEXT NOT NULL CHECK (cell_kind IN (
        'orchestrator', 'worker', 'verifier', 'advisor'
      )),
      status TEXT NOT NULL DEFAULT 'embryonic' CHECK (status IN (
        'embryonic', 'ready', 'active', 'waiting_signal', 'waiting_permission',
        'budget_quiescent', 'evidence_quiescent', 'completed_execution',
        'failed', 'quarantined', 'apoptotic', 'fossilized'
      )),
      stop_reason TEXT,
      checkpoint_id TEXT,
      context_size INTEGER NOT NULL DEFAULT 0 CHECK (context_size >= 0),
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (episode_id, mission_id, organization_id, project_id)
        REFERENCES mission_episodes(episode_id, mission_id, organization_id, project_id)
        ON DELETE CASCADE,
      FOREIGN KEY (parent_thread_id, episode_id, mission_id, organization_id, project_id)
        REFERENCES cell_threads(thread_id, episode_id, mission_id, organization_id, project_id)
        ON DELETE RESTRICT,
      UNIQUE (thread_id, episode_id, mission_id, organization_id, project_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cell_threads_root
      ON cell_threads(episode_id) WHERE parent_thread_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_cell_threads_parent
      ON cell_threads(parent_thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_cell_threads_scope
      ON cell_threads(organization_id, project_id, mission_id, episode_id, created_at);
  `);
}

module.exports = { migrateMissionEpisodes };
