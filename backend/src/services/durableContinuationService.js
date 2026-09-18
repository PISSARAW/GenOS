'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');

function serializeMission(mission) {
  return JSON.stringify(mission || {});
}

function deserializeMission(row) {
  try { return JSON.parse(row.mission_json || '{}'); } catch (_) { return null; }
}

async function persistContinuation(input = {}) {
  const db = input.db || await getDatabase();
  const id = input.id || `cont_${crypto.randomUUID()}`;
  await db.run(
    `INSERT OR REPLACE INTO continuation_queue
      (id, agent_id, orchestrator_id, mission_json, status, organization_id, project_id, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`,
    [id, input.agentId, input.orchestratorId || null, serializeMission(input.mission), input.organizationId || null, input.projectId || null]
  );
  return id;
}

async function loadContinuation(input = {}) {
  const db = input.db || await getDatabase();
  const row = await db.get(
    `SELECT * FROM continuation_queue WHERE agent_id = ? AND status = 'pending'
     ORDER BY available_at ASC, created_at ASC LIMIT 1`, input.agentId
  );
  return row ? { id: row.id, mission: deserializeMission(row), row } : null;
}

async function markContinuation(input = {}) {
  const db = input.db || await getDatabase();
  await db.run(
    `UPDATE continuation_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [input.status, input.id]
  );
}

module.exports = { persistContinuation, loadContinuation, markContinuation };
