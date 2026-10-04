'use strict';

async function migrateSignalReceptors(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS signal_receptors (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    target_ligand TEXT NOT NULL,
    threshold REAL NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
    target_agent_id TEXT,
    action TEXT NOT NULL,
    action_data_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(action_data_json))
  )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_signal_receptors_scope ON signal_receptors(organization_id, project_id, enabled)');
}

module.exports = { migrateSignalReceptors };
