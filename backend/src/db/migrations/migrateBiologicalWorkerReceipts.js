'use strict';

async function migrateBiologicalWorkerReceipts(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS biological_worker_bindings (
    run_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, agent_id TEXT NOT NULL,
    binding_hash TEXT NOT NULL, binding_json TEXT NOT NULL CHECK(json_valid(binding_json)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_biological_worker_mission ON biological_worker_bindings(mission_id, agent_id);
  CREATE TABLE IF NOT EXISTS biological_worker_observations (
    run_id TEXT NOT NULL, event_key TEXT NOT NULL, event_hash TEXT NOT NULL,
    event_json TEXT NOT NULL CHECK(json_valid(event_json)), applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1)),
    PRIMARY KEY(run_id, event_key)
  );
  CREATE TABLE IF NOT EXISTS biological_worker_receipts (
    receipt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE, mission_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL, receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_biological_worker_receipts_mission ON biological_worker_receipts(mission_id);
  CREATE TRIGGER IF NOT EXISTS biological_observation_content_immutable
    BEFORE UPDATE OF run_id, event_key, event_hash, event_json ON biological_worker_observations
    BEGIN SELECT RAISE(ABORT, 'Immutable biological observation'); END;
  CREATE TRIGGER IF NOT EXISTS biological_observation_monotonic
    BEFORE UPDATE OF applied ON biological_worker_observations WHEN OLD.applied = 1 AND NEW.applied = 0
    BEGIN SELECT RAISE(ABORT, 'Applied observation cannot regress'); END;`);
  for (const table of ['biological_worker_bindings', 'biological_worker_receipts']) {
    await db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'Immutable biological record'); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'Immutable biological record'); END;`);
  }
  await db.exec(`CREATE TRIGGER IF NOT EXISTS biological_observation_no_delete
    BEFORE DELETE ON biological_worker_observations BEGIN SELECT RAISE(ABORT, 'Immutable biological observation'); END;`);
}
module.exports = { migrateBiologicalWorkerReceipts };
