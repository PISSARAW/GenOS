'use strict';

const { upgradeEpisodeMultiplicity } = require('./migrateEndogenousThoughtCycles');

async function migrateEndogenousThoughtTasks(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS endogenous_thought_task_bindings (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      binding_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      question_ref TEXT NOT NULL,
      decision_ref TEXT NOT NULL,
      task_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      queued_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, binding_id),
      UNIQUE(organization_id, project_id, decision_ref),
      UNIQUE(organization_id, project_id, task_id),
      UNIQUE(organization_id, project_id, receipt_id),
      FOREIGN KEY(organization_id, project_id, episode_id)
        REFERENCES endogenous_thought_episodes(organization_id, project_id, episode_id)
        ON DELETE RESTRICT,
      FOREIGN KEY(task_id) REFERENCES ontogenesis_backlog(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_endogenous_task_binding_episode
      ON endogenous_thought_task_bindings(
        organization_id, project_id, episode_id, queued_at DESC);
    CREATE TRIGGER IF NOT EXISTS endogenous_task_binding_no_update
      BEFORE UPDATE ON endogenous_thought_task_bindings
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought task bindings are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_task_binding_no_delete
      BEFORE DELETE ON endogenous_thought_task_bindings
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought task bindings are durable evidence'); END;
  `);
  if (await upgradeEpisodeMultiplicity(db, 'endogenous_thought_task_bindings')) {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_endogenous_task_binding_episode
      ON endogenous_thought_task_bindings(
        organization_id, project_id, episode_id, queued_at DESC);
      CREATE TRIGGER IF NOT EXISTS endogenous_task_binding_no_update
        BEFORE UPDATE ON endogenous_thought_task_bindings
        BEGIN SELECT RAISE(ABORT, 'Endogenous thought task bindings are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS endogenous_task_binding_no_delete
        BEFORE DELETE ON endogenous_thought_task_bindings
        BEGIN SELECT RAISE(ABORT, 'Endogenous thought task bindings are durable evidence'); END;`);
  }
}

module.exports = { migrateEndogenousThoughtTasks };
