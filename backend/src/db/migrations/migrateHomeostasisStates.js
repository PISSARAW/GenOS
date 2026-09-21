'use strict';

async function migrateHomeostasisStates(db) {
  // Recreate the table when the status CHECK is stale: CREATE TABLE IF NOT
  // EXISTS never upgrades an existing constraint, and 'evidence_missing' was
  // added after the first deployment.
  const existing = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='homeostasis_states'");
  if (existing && !existing.sql.includes('evidence_missing')) {
    await db.exec(`DROP TABLE IF EXISTS homeostasis_states;`);
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS homeostasis_states (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    contract_json TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(contract_json)), CHECK (json_valid(state_json)),
    CHECK (status IN ('homeostasis_satisfied', 'partially_stable', 'unsafe', 'unstable', 'evidence_missing', 'unknown'))
  );
  CREATE INDEX IF NOT EXISTS idx_homeostasis_states_mission
    ON homeostasis_states(mission_id, observed_at);
  `);
}

module.exports = { migrateHomeostasisStates };