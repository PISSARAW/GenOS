'use strict';

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const TRANSITIONS = {
  designed: ['sealed_running', 'rejected'],
  sealed_running: ['sealed_complete', 'escalated', 'rejected'],
  sealed_complete: ['cross_examining', 'escalated'],
  cross_examining: ['decided', 'escalated'],
  decided: ['promotion_preparing', 'escalated'],
  promotion_preparing: ['promoted', 'promotion_failed'],
  promoted: [], rejected: [], escalated: [], promotion_failed: []
};

async function create(db, input) {
  if (!HASH_PATTERN.test(String(input.snapshotHash || ''))) {
    throw Object.assign(new Error('Trinity requires a SHA-256 snapshot hash.'), { code: 'TRINITY_SNAPSHOT_REQUIRED' });
  }
  await db.run(
    `INSERT INTO trinity_experiments
      (id, mission_id, domain, mission_snapshot_hash, design_json, isolation_policy_json, budget_policy_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'designed')`,
    input.id, input.missionId, input.domain, input.snapshotHash,
    JSON.stringify(input.design || {}), JSON.stringify(input.isolationPolicy || {}), JSON.stringify(input.budgetPolicy || {})
  );
  return transition(db, { id: input.id, status: 'sealed_running' });
}

async function createWorld(db, input) {
  await db.run(
    `INSERT INTO trinity_worlds
      (id, mission, world_number, name, strategy, status, agent_id, experiment_id, chamber, snapshot_hash, workspace_root)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id, input.mission, input.worldNumber, input.name, input.strategy, input.status, input.agentId,
    input.experimentId, input.chamber, input.snapshotHash, input.workspaceRoot
  );
}

async function transition(db, input) {
  const current = await db.get('SELECT status FROM trinity_experiments WHERE id = ?', input.id);
  if (!current) throw Object.assign(new Error(`Trinity experiment '${input.id}' was not found.`), { code: 'TRINITY_EXPERIMENT_NOT_FOUND' });
  if (!(TRANSITIONS[current.status] || []).includes(input.status)) {
    throw Object.assign(new Error(`Invalid Trinity experiment transition ${current.status} -> ${input.status}.`), { code: 'TRINITY_INVALID_TRANSITION' });
  }
  const result = await db.run(
    `UPDATE trinity_experiments SET status = ?, decision_json = COALESCE(?, decision_json),
      failure_reason = COALESCE(?, failure_reason), updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ?`,
    input.status, input.decision ? JSON.stringify(input.decision) : null, input.failureReason || null, input.id, current.status
  );
  if (result?.changes !== 1) throw Object.assign(new Error('Trinity experiment changed concurrently.'), { code: 'TRINITY_CONCURRENT_TRANSITION' });
  return { ...current, status: input.status };
}

module.exports = { create, createWorld, transition };
