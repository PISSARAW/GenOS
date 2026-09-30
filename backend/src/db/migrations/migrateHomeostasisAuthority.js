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
  `);
  await db.run(
    'INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)',
    '086-homeostasis-authority',
    'Persist immutable versioned mission homeostasis contracts'
  );
}

module.exports = { migrateHomeostasisAuthority };
