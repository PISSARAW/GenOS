'use strict';
const { withTransaction } = require('../index');

async function migrateHomeostasisAuthority(db) {
  return withTransaction(db, () => createAuthorityStorage(db));
}

async function createAuthorityStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS homeostasis_contract_revisions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    contract_hash TEXT NOT NULL,
    contract_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (mission_id, revision),
    UNIQUE (mission_id, contract_hash),
    CHECK (json_valid(contract_json))
  );
  CREATE INDEX IF NOT EXISTS idx_homeostasis_contract_mission
    ON homeostasis_contract_revisions(mission_id, revision);
  CREATE TABLE IF NOT EXISTS homeostasis_transition_receipts (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    contract_revision INTEGER NOT NULL,
    contract_hash TEXT NOT NULL,
    allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)),
    status TEXT NOT NULL,
    receipt_hash TEXT NOT NULL UNIQUE,
    receipt_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(receipt_json))
  );
  CREATE INDEX IF NOT EXISTS idx_homeostasis_transition_mission
    ON homeostasis_transition_receipts(mission_id, created_at);
  CREATE TABLE IF NOT EXISTS homeostasis_contract_heads (
    mission_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL,
    FOREIGN KEY (mission_id, revision)
      REFERENCES homeostasis_contract_revisions(mission_id, revision)
  );
  INSERT OR IGNORE INTO homeostasis_contract_heads (mission_id, revision)
    SELECT mission_id, MAX(revision) FROM homeostasis_contract_revisions GROUP BY mission_id;
  CREATE TRIGGER IF NOT EXISTS homeostasis_revision_no_update
    BEFORE UPDATE ON homeostasis_contract_revisions BEGIN SELECT RAISE(ABORT, 'Immutable homeostasis revision'); END;
  CREATE TRIGGER IF NOT EXISTS homeostasis_revision_no_delete
    BEFORE DELETE ON homeostasis_contract_revisions BEGIN SELECT RAISE(ABORT, 'Immutable homeostasis revision'); END;
  CREATE TRIGGER IF NOT EXISTS homeostasis_transition_no_update
    BEFORE UPDATE ON homeostasis_transition_receipts BEGIN SELECT RAISE(ABORT, 'Immutable homeostasis transition'); END;
  CREATE TRIGGER IF NOT EXISTS homeostasis_transition_no_delete
    BEFORE DELETE ON homeostasis_transition_receipts BEGIN SELECT RAISE(ABORT, 'Immutable homeostasis transition'); END;`);
  await ensureCompletionGuard(db);
  await db.run(
    'INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)',
    '086-homeostasis-authority',
    'Persist immutable versioned mission homeostasis contracts'
  );
}

async function ensureCompletionGuard(db) {
  const dependencies = await db.get(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN (
    'homeostasis_states', 'mission_agents', 'agents', 'strategy_execution_runs', 'biological_worker_receipts',
    'biological_worker_observations', 'biological_worker_bindings', 'biological_execution_receipts', 'mission_regeneration_attempts')`);
  await db.exec('DROP TRIGGER IF EXISTS mission_completion_homeostasis_authority');
  if (dependencies.count !== 9) {
    await db.exec(`CREATE TRIGGER mission_completion_homeostasis_authority BEFORE UPDATE OF status ON missions
      WHEN NEW.status = 'completed' AND OLD.status != 'completed'
      BEGIN SELECT RAISE(ABORT, 'Homeostasis transition receipt required'); END;`);
    return;
  }
  await db.exec(`
  CREATE TRIGGER mission_completion_homeostasis_authority
    BEFORE UPDATE OF status ON missions WHEN NEW.status = 'completed' AND OLD.status != 'completed'
    BEGIN
      SELECT CASE WHEN OLD.status != 'active' OR NOT EXISTS (
        SELECT 1 FROM homeostasis_transition_receipts t JOIN homeostasis_contract_heads h
          ON h.mission_id = t.mission_id AND h.revision = t.contract_revision
        WHERE t.mission_id = NEW.mission_id AND t.allowed = 1
          AND t.rowid = (SELECT MAX(rowid) FROM homeostasis_transition_receipts WHERE mission_id = NEW.mission_id)
          AND json_extract(t.receipt_json, '$.stateId') = (
            SELECT id FROM homeostasis_states WHERE mission_id = NEW.mission_id ORDER BY rowid DESC LIMIT 1)
          AND NOT EXISTS (
            SELECT 1 FROM mission_agents ma JOIN agents a ON a.id = ma.agent_id
            LEFT JOIN strategy_execution_runs r ON r.id = (
              SELECT id FROM strategy_execution_runs WHERE agent_id = a.id ORDER BY rowid DESC LIMIT 1)
            LEFT JOIN biological_worker_receipts wr ON wr.run_id = r.id
            WHERE ma.mission_id = NEW.mission_id AND a.execution_mode = 'worker'
              AND NOT EXISTS (SELECT 1 FROM mission_regeneration_attempts replacement
                WHERE replacement.mission_id = NEW.mission_id AND replacement.lost_agent_id = a.id AND replacement.status = 'verified')
              AND (r.id IS NULL OR r.status != 'completed' OR wr.receipt_id IS NULL
                OR json_extract(wr.receipt_json, '$.result.verified') != 1
                OR json_extract(wr.receipt_json, '$.budgetAssessment.satisfied') != 1
                OR NOT EXISTS (SELECT 1 FROM json_each(t.receipt_json, '$.executionReceipts') e
                  WHERE json_extract(e.value, '$.runId') = r.id AND json_extract(e.value, '$.payloadHash') = wr.payload_hash))
          )
          AND NOT EXISTS (
            SELECT 1 FROM biological_worker_observations o JOIN biological_worker_bindings b ON b.run_id = o.run_id
            WHERE b.mission_id = NEW.mission_id AND o.applied = 0)
          AND NOT EXISTS (
            SELECT 1 FROM biological_execution_receipts br WHERE br.mission_id = NEW.mission_id
              AND NOT EXISTS (SELECT 1 FROM json_each(t.receipt_json, '$.executionReceipts') e
                WHERE json_extract(e.value, '$.receiptId') = br.receipt_id
                  AND json_extract(e.value, '$.payloadHash') = br.payload_hash))
      ) THEN RAISE(ABORT, 'Homeostasis transition receipt required') END;
    END;
  `);
}

module.exports = { migrateHomeostasisAuthority, ensureCompletionGuard };
