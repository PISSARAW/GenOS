'use strict';

const { identifier } = require('./contract');

async function hasTables(db, names) {
  const marks = names.map(() => '?').join(',');
  const rows = await db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${marks})`, ...names);
  return rows.length === names.length;
}

async function scopedAgents(db, scope, missionId) {
  const mission = missionId === undefined ? ''
    : ' AND a.id IN (SELECT agent_id FROM mission_agents WHERE mission_id=?)';
  const params = [scope.organizationId, scope.projectId];
  if (missionId !== undefined) params.push(identifier(missionId, 'missionId'));
  return db.all(`SELECT a.id,a.parent_agent_id,a.metadata_json FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id
    WHERE w.organization_id=? AND w.project_id=?${mission} ORDER BY a.id LIMIT 129`, ...params);
}

async function missionMembers(db, request) {
  const missionId = identifier(request.missionId, 'missionId');
  if (!await hasTables(db, ['mission_agents', 'missions'])) return null;
  const rows = await db.all(`SELECT ma.agent_id FROM mission_agents ma
    JOIN missions m ON m.mission_id=ma.mission_id WHERE ma.mission_id=?`, missionId);
  const ids = new Set(rows.map(row => row.agent_id));
  return ids.has(request.agentId) ? ids : null;
}

function metadata(row) {
  const value = JSON.parse(row.metadata_json || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_GRAPH_METADATA');
  return value;
}

function graphOf(rows, edges, scope) {
  if (rows.length > 128 || edges.length > 512) throw new Error('GRAPH_CAPACITY');
  return { nodes: rows.map(row => ({ id: identifier(row.id, 'agentId'), scope })), edges };
}

module.exports = { hasTables, scopedAgents, missionMembers, metadata, graphOf };
