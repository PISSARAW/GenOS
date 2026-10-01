'use strict';

async function resolveDevelopmentalScope(db, agentId, requestedScope) {
  if (!db || !agentId) return null;
  const row = await db.get(`SELECT w.organization_id AS organizationId, w.project_id AS projectId
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
  if (!row?.organizationId || !row?.projectId) return null;
  const scope = { organizationId: row.organizationId, projectId: row.projectId };
  if (requestedScope && !sameScope(scope, requestedScope)) {
    throw Object.assign(new Error('Developmental scope does not match the persisted agent workspace.'), {
      code: 'DEVELOPMENTAL_SCOPE_MISMATCH'
    });
  }
  return scope;
}

function sameScope(left, right) {
  return left.organizationId === right.organizationId && left.projectId === right.projectId;
}

module.exports = { resolveDevelopmentalScope };
