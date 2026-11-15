'use strict';

function failure() {
  return Object.assign(new Error('Worker lineage is outside its authorized workspace.'), {
    code: 'WORKER_GENOME_SCOPE_MISMATCH'
  });
}

async function assertAuthorized(db, input) {
  const current = await db.get('SELECT workspace_id FROM agents WHERE id = ?', input.agent.id);
  if (!current || current.workspace_id !== input.agent.workspace_id) throw failure();
  const authorized = await db.get(`WITH RECURSIVE ancestors(id, workspace_id, parent_agent_id) AS (
    SELECT id, workspace_id, parent_agent_id FROM agents WHERE id = ?
    UNION ALL
    SELECT parent.id, parent.workspace_id, parent.parent_agent_id FROM agents parent
    JOIN ancestors child ON parent.id = child.parent_agent_id
  ) SELECT id FROM ancestors WHERE workspace_id = ? LIMIT 1`,
  input.agent.id, input.lineageWorkspaceId);
  if (!authorized) throw failure();
}

module.exports = { assertAuthorized };
