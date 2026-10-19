'use strict';

async function migrateShevHealingCycle(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_healing_episodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_observation_id TEXT NOT NULL,
      mandate_version INTEGER NOT NULL,
      current_phase TEXT NOT NULL CHECK (current_phase IN (
        'lesion', 'hemostasis', 'inflammation', 'proliferation',
        'remodeling', 'healed', 'relapsed', 'scarred'
      )),
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      UNIQUE (project_id, source_observation_id),
      FOREIGN KEY (project_id, source_observation_id)
        REFERENCES shev_observations(project_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shev_healing_project
      ON shev_healing_episodes(project_id, current_phase, opened_at);
    CREATE TRIGGER IF NOT EXISTS shev_healing_contract_no_update
      BEFORE UPDATE OF id, project_id, source_observation_id, mandate_version, opened_at
      ON shev_healing_episodes
      BEGIN SELECT RAISE(ABORT, 'shev_healing_contract_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_healing_no_delete
      BEFORE DELETE ON shev_healing_episodes
      BEGIN SELECT RAISE(ABORT, 'shev_healing_episode_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_healing_events (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL REFERENCES shev_healing_episodes(id),
      sequence INTEGER NOT NULL,
      from_phase TEXT,
      to_phase TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      UNIQUE (episode_id, sequence)
    );
    CREATE TRIGGER IF NOT EXISTS shev_healing_event_no_update
      BEFORE UPDATE ON shev_healing_events
      BEGIN SELECT RAISE(ABORT, 'shev_healing_event_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_healing_event_no_delete
      BEFORE DELETE ON shev_healing_events
      BEGIN SELECT RAISE(ABORT, 'shev_healing_event_immutable'); END;
  `);
}

module.exports = { migrateShevHealingCycle };
