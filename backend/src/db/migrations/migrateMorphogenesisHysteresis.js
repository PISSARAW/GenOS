'use strict';

async function migrateMorphogenesisHysteresis(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS morphogenesis_hysteresis (
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 1),
    budget_left REAL NOT NULL CHECK(budget_left >= 0 AND budget_left <= 1),
    last_commit_unix_ms INTEGER NOT NULL CHECK(last_commit_unix_ms > 0),
    last_transition_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(organization_id, project_id, mission_id),
    UNIQUE(organization_id, project_id, mission_id, last_transition_id)
  )`);
}

module.exports = { migrateMorphogenesisHysteresis };
