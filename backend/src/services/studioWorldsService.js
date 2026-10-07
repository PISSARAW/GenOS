'use strict';

function failure(code, status, message) {
  return Object.assign(new Error(message || code), { code, status });
}

async function agent(db, context) {
  const row = await db.get(`SELECT a.* FROM agents a JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
  context.agentId, context.scope.organizationId, context.scope.projectId);
  if (!row) throw failure('AGENT_NOT_FOUND', 404);
  return row;
}

async function inspect(db, context) {
  const current = await agent(db, context);
  const checkpoints = await db.all(`SELECT id, agent_id, workspace_id, reason, ref_name,
    parent_snapshot_id, created_at FROM agent_state_snapshots WHERE agent_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`, current.id);
  const relatives = await db.all(`SELECT a.id, a.name, a.status, a.parent_agent_id, a.workspace_id, a.lineage_relation
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE (a.id = ? OR a.parent_agent_id = ?)
    AND w.organization_id = ? AND w.project_id = ? ORDER BY a.created_at DESC LIMIT 100`,
  current.id, current.id, context.scope.organizationId, context.scope.projectId);
  return { agentId: current.id, workspaceId: current.workspace_id, checkpoints, relatives,
    cloneIsolation: 'shared_workspace', automaticPromotion: false, limit: 100 };
}

module.exports = { agent, inspect, failure };
