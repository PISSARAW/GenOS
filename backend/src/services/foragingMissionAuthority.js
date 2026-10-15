'use strict';

const FORAGING_MISSION_QUERY = `SELECT m.mission_id FROM missions m
  JOIN mission_agents ma ON ma.mission_id = m.mission_id
  JOIN agents a ON a.id = ma.agent_id
  LEFT JOIN workspaces w ON w.id = a.workspace_id
  WHERE m.mission_id = ? AND ma.agent_id = ? AND m.status = 'active'
    AND (? IS NULL OR w.organization_id = ?) AND (? IS NULL OR w.project_id = ?)`;

function authorityError() {
  return Object.assign(new Error('Authenticated caller is not assigned to the active foraging mission.'), {
    code: 'FORAGING_MISSION_AUTHORITY_REQUIRED'
  });
}

async function assertActiveMissionMember(input) {
  const agentId = String(input.caller?.agentId || '').trim();
  const missionId = String(input.missionId || '').trim();
  if (!agentId || !missionId) throw authorityError();
  const tenant = input.caller.tenant || {};
  const organizationId = tenant.organizationId || null;
  const projectId = tenant.projectId || null;
  const row = await input.db.get(FORAGING_MISSION_QUERY, missionId, agentId,
    organizationId, organizationId, projectId, projectId);
  if (!row) throw authorityError();
  return row;
}

module.exports = { assertActiveMissionMember };
