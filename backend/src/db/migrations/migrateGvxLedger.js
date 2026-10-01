'use strict';

async function migrateGvxLedger(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gvx_development_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'snapshot_created', 'transformation_proposed', 'experiment_started',
        'experiment_finished', 'evidence_attached', 'decision_recorded',
        'application_recorded', 'transfer_recorded', 'rollback_recorded'
      )),
      parent_hash TEXT,
      candidate_hash TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gvx_events_scope
      ON gvx_development_events(organization_id, project_id, entity_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_gvx_events_parent
      ON gvx_development_events(parent_hash) WHERE parent_hash IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS gvx_events_no_update
      BEFORE UPDATE ON gvx_development_events
      BEGIN SELECT RAISE(ABORT, 'gvx_event_is_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS gvx_events_no_delete
      BEFORE DELETE ON gvx_development_events
      BEGIN SELECT RAISE(ABORT, 'gvx_event_is_immutable'); END;
  `);
}

module.exports = { migrateGvxLedger };
