'use strict';

async function migrateHomeostasisAuthority(db) {
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
    BEFORE DELETE ON homeostasis_transition_receipts BEGIN SELECT RAISE(ABORT, 'Immutable homeostasis transition'); END;
  `);
  await db.run(
    'INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)',
    '086-homeostasis-authority',
    'Persist immutable versioned mission homeostasis contracts'
  );
}

module.exports = { migrateHomeostasisAuthority };
