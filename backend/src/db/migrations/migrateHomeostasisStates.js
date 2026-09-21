'use strict';

async function migrateHomeostasisStates(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS homeostasis_states (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    contract_json TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(contract_json)), CHECK (json_valid(state_json)),
    CHECK (status IN ('homeostasis_satisfied', 'partially_stable', 'unsafe', 'unstable', 'unknown'))
  );
  CREATE INDEX IF NOT EXISTS idx_homeostasis_states_mission
    ON homeostasis_states(mission_id, observed_at);
  `);
}

module.exports = { migrateHomeostasisStates };