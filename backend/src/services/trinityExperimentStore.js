'use strict';

const path = require('path');
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
  return transition(db, { id: input.id, status: 'sealed_running', reason: 'three_worlds_sealed' });
}

async function createWorld(db, input) {
  await assertWorkspaceIsUnique(db, input);
  await db.run(
    `INSERT INTO trinity_worlds
      (id, mission, world_number, name, strategy, status, agent_id, experiment_id, chamber, snapshot_hash, workspace_root)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id, input.mission, input.worldNumber, input.name, input.strategy, input.status, input.agentId,
    input.experimentId, input.chamber, input.snapshotHash, input.workspaceRoot
  );
}

async function assertWorkspaceIsUnique(db, input) {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  if (!workspaceRoot) {
    throw Object.assign(new Error('Every Trinity world requires an isolated workspace.'), { code: 'TRINITY_WORKSPACE_REQUIRED' });
  }
  const worlds = await db.all('SELECT workspace_root FROM trinity_worlds WHERE experiment_id = ?', input.experimentId);
  const duplicate = worlds.some((world) => normalizeWorkspaceRoot(world.workspace_root) === workspaceRoot);
  if (duplicate) throw Object.assign(new Error('Trinity worlds must use distinct workspace roots.'), { code: 'TRINITY_WORKSPACE_NOT_ISOLATED' });
}

function normalizeWorkspaceRoot(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const resolved = path.resolve(value.trim());
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
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
  await db.run(
    `INSERT INTO trinity_experiment_transitions (experiment_id, from_status, to_status, actor, reason, evidence_ref)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.id, current.status, input.status, input.actor || 'trinity_runtime', input.reason || null, input.evidenceRef || null
  );
  return { ...current, status: input.status };
}

module.exports = { create, createWorld, transition };
