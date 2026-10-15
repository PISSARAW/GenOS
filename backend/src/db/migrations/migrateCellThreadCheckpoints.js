'use strict';

const { migrateMissionEpisodes } = require('./migrateMissionEpisodes');

async function migrateCellThreadCheckpoints(db) {
  await migrateMissionEpisodes(db);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cell_thread_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      thread_revision INTEGER NOT NULL CHECK (thread_revision >= 0),
      thread_state TEXT NOT NULL CHECK (thread_state IN (
        'ready', 'waiting_signal', 'waiting_permission', 'budget_quiescent',
        'evidence_quiescent', 'quarantined'
      )),
      context_json TEXT NOT NULL CHECK (json_valid(context_json)),
      context_size INTEGER NOT NULL CHECK (context_size >= 0 AND context_size <= 262144),
      context_hash TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
      checkpoint_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id, episode_id, mission_id, organization_id, project_id)
        REFERENCES cell_threads(thread_id, episode_id, mission_id, organization_id, project_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_cell_thread_checkpoint_scope
      ON cell_thread_checkpoints(
        organization_id, project_id, mission_id, episode_id, thread_id, created_at
      );
    CREATE TABLE IF NOT EXISTS cell_thread_checkpoint_resumptions (
      resumption_id TEXT PRIMARY KEY,
      checkpoint_id TEXT NOT NULL UNIQUE,
      mission_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      previous_revision INTEGER NOT NULL CHECK (previous_revision >= 0),
      resumed_revision INTEGER NOT NULL CHECK (resumed_revision = previous_revision + 1),
      previous_state TEXT NOT NULL,
      resumed_state TEXT NOT NULL CHECK (resumed_state = 'active'),
      proof_code TEXT NOT NULL CHECK (length(proof_code) BETWEEN 1 AND 1024),
      proof_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (checkpoint_id) REFERENCES cell_thread_checkpoints(checkpoint_id)
        ON DELETE RESTRICT,
      FOREIGN KEY (thread_id, episode_id, mission_id, organization_id, project_id)
        REFERENCES cell_threads(thread_id, episode_id, mission_id, organization_id, project_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_cell_thread_resumption_scope
      ON cell_thread_checkpoint_resumptions(
        organization_id, project_id, mission_id, episode_id, thread_id, created_at
      );
    CREATE TRIGGER IF NOT EXISTS cell_thread_checkpoint_lineage_guard
      BEFORE INSERT ON cell_thread_checkpoints
      WHEN NOT EXISTS (
        SELECT 1 FROM cell_threads cell
        WHERE cell.thread_id = NEW.thread_id AND cell.episode_id = NEW.episode_id
          AND cell.mission_id = NEW.mission_id
          AND cell.organization_id = NEW.organization_id
          AND cell.project_id = NEW.project_id AND cell.worker_id = NEW.worker_id
          AND cell.revision = NEW.thread_revision AND cell.status = NEW.thread_state
      )
      BEGIN SELECT RAISE(ABORT, 'CELL_THREAD_CHECKPOINT_LINEAGE_MISMATCH'); END;
    CREATE TRIGGER IF NOT EXISTS cell_thread_resumption_lineage_guard
      BEFORE INSERT ON cell_thread_checkpoint_resumptions
      WHEN NOT EXISTS (
        SELECT 1 FROM cell_thread_checkpoints checkpoint
        JOIN cell_threads cell ON cell.thread_id = checkpoint.thread_id
        WHERE checkpoint.checkpoint_id = NEW.checkpoint_id
          AND checkpoint.thread_id = NEW.thread_id
          AND checkpoint.episode_id = NEW.episode_id
          AND checkpoint.mission_id = NEW.mission_id
          AND checkpoint.organization_id = NEW.organization_id
          AND checkpoint.project_id = NEW.project_id
          AND checkpoint.worker_id = NEW.worker_id
          AND checkpoint.thread_revision = NEW.previous_revision
          AND checkpoint.thread_state = NEW.previous_state
          AND cell.revision = NEW.resumed_revision AND cell.status = NEW.resumed_state
      )
      BEGIN SELECT RAISE(ABORT, 'CELL_THREAD_RESUMPTION_LINEAGE_MISMATCH'); END;
    CREATE TRIGGER IF NOT EXISTS cell_thread_checkpoint_immutable_update
      BEFORE UPDATE ON cell_thread_checkpoints
      BEGIN SELECT RAISE(ABORT, 'CELL_THREAD_CHECKPOINT_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS cell_thread_checkpoint_immutable_delete
      BEFORE DELETE ON cell_thread_checkpoints
      BEGIN SELECT RAISE(ABORT, 'CELL_THREAD_CHECKPOINT_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS cell_thread_resumption_immutable_update
      BEFORE UPDATE ON cell_thread_checkpoint_resumptions
      BEGIN SELECT RAISE(ABORT, 'CELL_THREAD_RESUMPTION_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS cell_thread_resumption_immutable_delete
      BEFORE DELETE ON cell_thread_checkpoint_resumptions
      BEGIN SELECT RAISE(ABORT, 'CELL_THREAD_RESUMPTION_IMMUTABLE'); END;
  `);
}

module.exports = { migrateCellThreadCheckpoints };
