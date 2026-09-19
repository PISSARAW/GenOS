'use strict';

async function migrateSurvivalState(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS survival_states (
    agent_id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'nominal',
    state_json TEXT NOT NULL DEFAULT '{}',
    pressures_json TEXT NOT NULL DEFAULT '[]',
    actions_json TEXT NOT NULL DEFAULT '[]',
    snapshot_id TEXT,
    wake_condition_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (state IN ('nominal', 'stressed', 'protected', 'dormant', 'waking', 'recovered', 'quarantined')),
    CHECK (json_valid(state_json)), CHECK (json_valid(pressures_json)), CHECK (json_valid(actions_json))
  );
  CREATE TABLE IF NOT EXISTS survival_state_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(payload_json))
  );
  CREATE INDEX IF NOT EXISTS idx_survival_state_events_agent ON survival_state_events(agent_id, id);
  CREATE TABLE IF NOT EXISTS survival_action_receipts (
    receipt_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, receipt_type TEXT NOT NULL,
    action TEXT NOT NULL, execution_id TEXT NOT NULL, evidence_ref TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome = 'succeeded'), payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
}

module.exports = { migrateSurvivalState };
