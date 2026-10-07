'use strict';

async function delegation(db, input) {
  const { agent, parent } = input;
  if (!agent || !parent) return null;
  const binding = await db.get(`SELECT w.workspace_root, w.snapshot_hash,
    e.mission_snapshot_hash, e.status, e.design_json, s.path, s.visibility,
    s.organization_id, s.project_id FROM trinity_worlds w
    JOIN trinity_experiments e ON e.id = w.experiment_id
    JOIN workspaces s ON s.id = ? WHERE w.agent_id = ?`, agent.workspace_id, agent.id);
  if (!validBinding(binding, input)) return null;
  const tenant = await db.get('SELECT w.organization_id, w.project_id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', parent.id);
  if (!sameTenant(binding, tenant)) return null;
  return { ...agent, sealedDispatchParentId: parent.id };
}

function validBinding(binding, input) {
  if (!binding || binding.status !== 'sealed_running' || binding.visibility !== 'Private') return false;
  const { agent, parent } = input;
  if (agent.workspace_id !== 'trinity_workspace_' + agent.id || binding.path !== binding.workspace_root) return false;
  if (!binding.snapshot_hash || binding.snapshot_hash !== binding.mission_snapshot_hash) return false;
  try { return JSON.parse(binding.design_json).orchestratorId === parent.id; }
  catch { return false; }
}

function sameTenant(binding, tenant) {
  return Boolean(tenant) && (binding.organization_id || null) === (tenant.organization_id || null)
    && (binding.project_id || null) === (tenant?.project_id || null);
}

module.exports = { delegation };
