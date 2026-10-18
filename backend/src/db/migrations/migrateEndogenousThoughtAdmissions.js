'use strict';

async function migrateEndogenousThoughtAdmissions(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS endogenous_thought_admission_decisions (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      decision_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      question_ref TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('admitted','abstained')),
      reason TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, decision_id),
      UNIQUE(organization_id, project_id, question_ref),
      UNIQUE(organization_id, project_id, receipt_id),
      FOREIGN KEY(organization_id, project_id, episode_id)
        REFERENCES endogenous_thought_episodes(organization_id, project_id, episode_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_endogenous_admission_episode
      ON endogenous_thought_admission_decisions(
        organization_id, project_id, episode_id, decided_at DESC);
    CREATE TRIGGER IF NOT EXISTS endogenous_admission_no_update
      BEFORE UPDATE ON endogenous_thought_admission_decisions
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought admissions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_admission_no_delete
      BEFORE DELETE ON endogenous_thought_admission_decisions
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought admissions are durable evidence'); END;
  `);
}

module.exports = { migrateEndogenousThoughtAdmissions };
