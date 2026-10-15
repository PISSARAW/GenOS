'use strict';

async function addColumn(db, columns, definition) {
  const name = definition.split(/\s+/, 1)[0];
  if (columns.has(name)) return;
  await db.exec(`ALTER TABLE mission_episodes ADD COLUMN ${definition}`);
}

async function migrateMissionEpisodeRecovery(db) {
  await require('./migrateMissionEpisodes').migrateMissionEpisodes(db);
  const columns = new Set((await db.all('PRAGMA table_info(mission_episodes)'))
    .map((column) => column.name));
  await addColumn(db, columns, 'owner_agent_id TEXT');
  await addColumn(db, columns, 'owner_run_id TEXT');
  await addColumn(db, columns, 'owner_pid INTEGER');
  await addColumn(db, columns, 'runtime_pid INTEGER');
  await addColumn(db, columns, 'owner_generation INTEGER');
  await addColumn(db, columns, 'owner_authority_hash TEXT');
  await addColumn(db, columns, 'owner_bound_at TEXT');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mission_episode_recovery_receipts (
      receipt_id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      owner_agent_id TEXT NOT NULL,
      owner_run_id TEXT NOT NULL,
      owner_pid INTEGER NOT NULL,
      runtime_pid INTEGER,
      authority_generation INTEGER NOT NULL,
      authority_token_hash TEXT NOT NULL,
      observed_authority_state TEXT NOT NULL,
      observed_run_status TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome = 'interrupted_quarantined'),
      quarantined_threads INTEGER NOT NULL CHECK (quarantined_threads >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (episode_id, owner_run_id, authority_generation),
      FOREIGN KEY (episode_id, mission_id, organization_id, project_id)
        REFERENCES mission_episodes(episode_id, mission_id, organization_id, project_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_episode_recovery_receipt_scope
      ON mission_episode_recovery_receipts(
        organization_id, project_id, mission_id, episode_id, created_at
      );
    CREATE TRIGGER IF NOT EXISTS mission_episode_recovery_receipt_immutable_update
      BEFORE UPDATE ON mission_episode_recovery_receipts
      BEGIN SELECT RAISE(ABORT, 'MISSION_EPISODE_RECOVERY_RECEIPT_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS mission_episode_recovery_receipt_immutable_delete
      BEFORE DELETE ON mission_episode_recovery_receipts
      BEGIN SELECT RAISE(ABORT, 'MISSION_EPISODE_RECOVERY_RECEIPT_IMMUTABLE'); END;
  `);
}

module.exports = { migrateMissionEpisodeRecovery };
