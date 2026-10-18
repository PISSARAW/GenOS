'use strict';

async function migrateEndogenousThoughtEpisodes(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS endogenous_thought_episodes (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      mandate_ref TEXT NOT NULL,
      trigger_ref TEXT NOT NULL,
      budget_json TEXT NOT NULL,
      current_state TEXT NOT NULL CHECK(current_state IN
        ('DETECTED','QUESTIONED','ADMITTED','QUEUED','RUNNING','VERIFIED','LEARNED',
         'FOLLOW_UP','STOPPED','ABSTAINED','FAILED')),
      current_receipt_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version >= 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, episode_id)
    );
    CREATE TABLE IF NOT EXISTS endogenous_thought_questions (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, question_id),
      UNIQUE(organization_id, project_id, receipt_id),
      FOREIGN KEY(organization_id, project_id, episode_id)
        REFERENCES endogenous_thought_episodes(organization_id, project_id, episode_id)
        ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS endogenous_thought_receipts (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      transition_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK(sequence >= 0),
      previous_receipt_id TEXT,
      from_state TEXT CHECK(from_state IS NULL OR from_state IN
        ('DETECTED','QUESTIONED','ADMITTED','QUEUED','RUNNING','VERIFIED','LEARNED',
         'FOLLOW_UP','STOPPED','ABSTAINED','FAILED')),
      to_state TEXT NOT NULL CHECK(to_state IN
        ('DETECTED','QUESTIONED','ADMITTED','QUEUED','RUNNING','VERIFIED','LEARNED',
         'FOLLOW_UP','STOPPED','ABSTAINED','FAILED')),
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, receipt_id),
      UNIQUE(organization_id, project_id, transition_id),
      UNIQUE(organization_id, project_id, episode_id, sequence),
      FOREIGN KEY(organization_id, project_id, episode_id)
        REFERENCES endogenous_thought_episodes(organization_id, project_id, episode_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_endogenous_thought_episode_state
      ON endogenous_thought_episodes(organization_id, project_id, current_state);
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_episode_identity_immutable
      BEFORE UPDATE OF organization_id, project_id, episode_id, agent_id, mandate_ref,
        trigger_ref, budget_json, created_at ON endogenous_thought_episodes
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought episode identity is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_episode_head_guard
      BEFORE UPDATE OF current_state, current_receipt_id, version ON endogenous_thought_episodes
      WHEN NEW.version != OLD.version + 1
        OR NEW.current_state = OLD.current_state
        OR NEW.current_receipt_id = OLD.current_receipt_id
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought episode head advance is invalid'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_episode_transition_guard
      BEFORE UPDATE OF current_state ON endogenous_thought_episodes
      WHEN NOT (
        (OLD.current_state='DETECTED' AND NEW.current_state IN ('QUESTIONED','ABSTAINED','FAILED'))
        OR (OLD.current_state='QUESTIONED' AND NEW.current_state IN ('ADMITTED','ABSTAINED','FAILED'))
        OR (OLD.current_state='ADMITTED' AND NEW.current_state IN ('QUEUED','ABSTAINED','FAILED'))
        OR (OLD.current_state='QUEUED' AND NEW.current_state IN ('RUNNING','STOPPED','FAILED'))
        OR (OLD.current_state='RUNNING' AND NEW.current_state IN ('VERIFIED','STOPPED','FAILED'))
        OR (OLD.current_state='VERIFIED' AND NEW.current_state IN ('LEARNED','STOPPED','FAILED'))
        OR (OLD.current_state='LEARNED' AND NEW.current_state IN ('FOLLOW_UP','STOPPED','FAILED'))
        OR (OLD.current_state='FOLLOW_UP' AND NEW.current_state IN ('QUESTIONED','STOPPED','FAILED'))
      )
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought state transition is invalid'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_episode_no_delete
      BEFORE DELETE ON endogenous_thought_episodes
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought episodes are durable evidence'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_question_no_update
      BEFORE UPDATE ON endogenous_thought_questions
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought questions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_question_no_delete
      BEFORE DELETE ON endogenous_thought_questions
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought questions are durable evidence'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_receipt_no_update
      BEFORE UPDATE ON endogenous_thought_receipts
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought receipts are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_thought_receipt_no_delete
      BEFORE DELETE ON endogenous_thought_receipts
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought receipts are durable evidence'); END;
  `);
}

module.exports = { migrateEndogenousThoughtEpisodes };
