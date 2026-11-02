'use strict';

async function legacyMembers(context, scope) {
  return context.db.all(`WITH RECURSIVE members(id) AS (
    SELECT id FROM agents WHERE id=?
    UNION SELECT a.id FROM agents a JOIN members m ON a.parent_agent_id=m.id
      JOIN workspaces w ON w.id=a.workspace_id
      WHERE w.organization_id=? AND w.project_id=?
    ) SELECT id FROM members LIMIT 129`, context.agentId, scope.organizationId, scope.projectId);
}

async function missionMembers(context, scope) {
  const mission = await context.db.get(`SELECT mission_id FROM missions
    WHERE mission_id=? AND orchestrator_agent_id=?`, context.missionId, context.agentId);
  if (!mission) return [{ id: context.agentId }];
  return context.db.all(`SELECT a.id FROM agents a JOIN workspaces w ON w.id=a.workspace_id
    WHERE w.organization_id=? AND w.project_id=? AND (a.id=? OR a.id IN (
      SELECT agent_id FROM mission_agents WHERE mission_id=?)) LIMIT 129`,
  scope.organizationId, scope.projectId, context.agentId, mission.mission_id);
}

async function memberIds(context, scope) {
  const tables = await context.db.all(`SELECT name FROM sqlite_master
    WHERE type='table' AND name IN ('missions','mission_agents')`);
  const rows = tables.length === 2
    ? await missionMembers(context, scope) : await legacyMembers(context, scope);
  return rows.length > 128 ? null : rows.map(row => row.id);
}

module.exports = { memberIds };
