'use strict';

async function migrateEndogenousThoughtLearnings(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS endogenous_thought_learnings (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      learning_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      verification_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK(verdict IN ('supported','refuted','inconclusive')),
      revision_operation TEXT NOT NULL CHECK(revision_operation IN ('reinforce','correct','defer')),
      revision_applied INTEGER NOT NULL CHECK(revision_applied IN (0,1)),
      policy_id TEXT NOT NULL,
      authorization_ref TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      learned_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, learning_id),
      UNIQUE(organization_id, project_id, episode_id),
      UNIQUE(organization_id, project_id, verification_id),
      UNIQUE(organization_id, project_id, receipt_id),
      FOREIGN KEY(organization_id, project_id, episode_id)
        REFERENCES endogenous_thought_episodes(organization_id, project_id, episode_id)
        ON DELETE RESTRICT,
      FOREIGN KEY(organization_id, project_id, verification_id)
        REFERENCES endogenous_thought_verifications(organization_id, project_id, verification_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_endogenous_learning_episode
      ON endogenous_thought_learnings(
        organization_id, project_id, episode_id, learned_at DESC);
    CREATE TRIGGER IF NOT EXISTS endogenous_learning_no_update
      BEFORE UPDATE ON endogenous_thought_learnings
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought learnings are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_learning_no_delete
      BEFORE DELETE ON endogenous_thought_learnings
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought learnings are durable evidence'); END;
  `);
}

module.exports = { migrateEndogenousThoughtLearnings };
