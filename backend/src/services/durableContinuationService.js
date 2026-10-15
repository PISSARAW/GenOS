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

async function loadCohortContinuations(input = {}) {
  const db = input.db || await getDatabase();
  const rows = await db.all(`SELECT * FROM continuation_queue WHERE orchestrator_id = ?
    AND status IN ('pending', 'dispatching', 'dispatched', 'dispatch_failed_ambiguous') ORDER BY created_at ASC`, input.orchestratorId);
  return (rows || []).map((row) => ({ row, mission: deserializeMission(row) }))
    .filter((item) => item.mission?.budgetRound?.stage === 'morphogenesis_epoch'
      && item.mission?.budgetRound?.missionId === input.missionId
      && Number(item.mission?.budgetRound?.epoch) === Number(input.epoch))
    .map((item) => ({ id: item.row.id, agentId: item.row.agent_id, status: item.row.status, mission: item.mission }));
}

async function markContinuation(input = {}) {
  const db = input.db || await getDatabase();
  await db.run(
    `UPDATE continuation_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [input.status, input.id]
  );
}

async function claimContinuation(input = {}) {
  const db = input.db || await getDatabase();
  const result = await db.run(`UPDATE continuation_queue SET status = 'dispatching',
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agent_id = ? AND status = 'pending'`,
  input.id, input.agentId);
  return Number(result?.changes || 0) === 1;
}

module.exports = { persistContinuation, persistContinuations, loadContinuation, loadCohortContinuations,
  markContinuation, claimContinuation };
