'use strict';

const crypto = require('crypto');
const { getDatabase, withTransaction } = require('../db');

function serializeMission(mission) {
  return JSON.stringify(mission || {});
}

function deserializeMission(row) {
  try { return JSON.parse(row.mission_json || '{}'); } catch (_) { return null; }
}

async function persistContinuation(input = {}) {
  const [id] = await persistContinuations({ db: input.db, continuations: [input] });
  return id;
}

async function persistContinuations(input = {}) {
  const db = input.db || await getDatabase();
  const continuations = Array.isArray(input.continuations) ? input.continuations : [];
  return withTransaction(db, async (tx) => {
    const ids = [];
    for (const item of continuations) {
      const id = item.id || `cont_${crypto.randomUUID()}`;
      await tx.run(
        `INSERT OR REPLACE INTO continuation_queue
          (id, agent_id, orchestrator_id, mission_json, status, organization_id, project_id, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`,
        [id, item.agentId, item.orchestratorId || null, serializeMission(item.mission),
          item.organizationId || null, item.projectId || null]
      );
      ids.push(id);
    }
    return ids;
  });
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

module.exports = { persistContinuation, persistContinuations, loadContinuation, markContinuation };
