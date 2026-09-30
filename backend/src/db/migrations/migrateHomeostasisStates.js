'use strict';

async function migrateHomeostasisStates(db) {
  // Idempotent without discarding the transition history. CREATE IF NOT EXISTS
  // is safe when several workers initialize the same SQLite database.
  await db.exec(`CREATE TABLE IF NOT EXISTS homeostasis_states (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(state_json)),
    CHECK (status IN ('homeostasis_satisfied', 'partially_stable', 'unsafe', 'unstable', 'evidence_missing', 'unknown'))
  );
  CREATE INDEX IF NOT EXISTS idx_homeostasis_states_mission
    ON homeostasis_states(mission_id, observed_at);
  CREATE INDEX IF NOT EXISTS idx_homeostasis_states_contract
    ON homeostasis_states(contract_id);
  `);
}

module.exports = { migrateHomeostasisStates };
