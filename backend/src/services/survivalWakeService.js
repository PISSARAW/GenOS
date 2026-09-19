'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');

function wakeId() {
  return `wake_${crypto.randomUUID()}`;
}

async function ensureStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS survival_wake_conditions (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, condition_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'armed', triggered_at DATETIME, snapshot_id TEXT,
    organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('armed', 'triggered', 'cancelled')), CHECK (json_valid(condition_json))
  );
  CREATE INDEX IF NOT EXISTS idx_survival_wake_conditions_agent ON survival_wake_conditions(agent_id, status);`);
  const columns = await db.all('PRAGMA table_info(survival_wake_conditions)');
  if (!columns.some((column) => column.name === 'snapshot_id')) await db.exec('ALTER TABLE survival_wake_conditions ADD COLUMN snapshot_id TEXT');
}

async function arm(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  const id = input.id || wakeId();
  await db.run(
    `INSERT INTO survival_wake_conditions
      (id, agent_id, condition_json, organization_id, project_id, snapshot_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.agentId, JSON.stringify(input.condition || {}), input.organizationId || null, input.projectId || null, input.snapshotId || null]
  );
  return get({ id, db });
}

async function get(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  const row = await db.get('SELECT * FROM survival_wake_conditions WHERE id = ?', input.id);
  return row ? format(row) : null;
}

async function listArmed(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  const rows = await db.all(
    `SELECT * FROM survival_wake_conditions WHERE agent_id = ? AND status = 'armed' ORDER BY created_at ASC`,
    input.agentId
  );
  return rows.map(format);
}

async function trigger(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  await db.run(
    `UPDATE survival_wake_conditions
     SET status = 'triggered', triggered_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'armed'`, input.id
  );
  return get({ id: input.id, db });
}

async function cancel(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  await db.run("UPDATE survival_wake_conditions SET status = 'cancelled' WHERE id = ? AND status = 'armed'", input.id);
  return get({ id: input.id, db });
}

function format(row) {
  return {
    id: row.id, agentId: row.agent_id, status: row.status,
    condition: JSON.parse(row.condition_json || '{}'), snapshotId: row.snapshot_id, organizationId: row.organization_id,
    projectId: row.project_id, createdAt: row.created_at, triggeredAt: row.triggered_at
  };
}

module.exports = { arm, get, listArmed, trigger, cancel, ensureStorage };
