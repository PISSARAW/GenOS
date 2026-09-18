'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');

function wakeId() {
  return `wake_${crypto.randomUUID()}`;
}

async function arm(input = {}) {
  const db = input.db || await getDatabase();
  const id = input.id || wakeId();
  await db.run(
    `INSERT INTO survival_wake_conditions
      (id, agent_id, condition_json, organization_id, project_id)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.agentId, JSON.stringify(input.condition || {}), input.organizationId || null, input.projectId || null]
  );
  return get({ id, db });
}

async function get(input = {}) {
  const db = input.db || await getDatabase();
  const row = await db.get('SELECT * FROM survival_wake_conditions WHERE id = ?', input.id);
  return row ? format(row) : null;
}

async function listArmed(input = {}) {
  const db = input.db || await getDatabase();
  const rows = await db.all(
    `SELECT * FROM survival_wake_conditions WHERE agent_id = ? AND status = 'armed' ORDER BY created_at ASC`,
    input.agentId
  );
  return rows.map(format);
}

async function trigger(input = {}) {
  const db = input.db || await getDatabase();
  await db.run(
    `UPDATE survival_wake_conditions
     SET status = 'triggered', triggered_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'armed'`, input.id
  );
  return get({ id: input.id, db });
}

async function cancel(input = {}) {
  const db = input.db || await getDatabase();
  await db.run("UPDATE survival_wake_conditions SET status = 'cancelled' WHERE id = ? AND status = 'armed'", input.id);
  return get({ id: input.id, db });
}

function format(row) {
  return {
    id: row.id, agentId: row.agent_id, status: row.status,
    condition: JSON.parse(row.condition_json || '{}'), organizationId: row.organization_id,
    projectId: row.project_id, createdAt: row.created_at, triggeredAt: row.triggered_at
  };
}

module.exports = { arm, get, listArmed, trigger, cancel };
