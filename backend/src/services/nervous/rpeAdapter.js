'use strict';

const { scopeOf } = require('./contract');
const source = require('./graphSource');
const { TYPES } = require('../relationalPhysiology/catalog');

function active(row, now) {
  if (!TYPES.includes(row.relation_type)) return false;
  const record = source.metadata(row);
  const state = record.state ?? 'active';
  const from = record.validFrom ?? 0;
  const until = record.validUntil ?? null;
  validity(from, until);
  return state === 'active' && from <= now && (until === null || now < until);
}

function validity(from, until) {
  if (!Number.isSafeInteger(from) || from < 0) throw new Error('INVALID_RELATION_VALIDITY');
  if (until !== null && (!Number.isSafeInteger(until) || until <= from)) throw new Error('INVALID_RELATION_VALIDITY');
}

async function membersFor(input, scope) {
  const missionId = input.event.payload?.missionId ?? input.event.payload?.mission_id;
  if (missionId === undefined) return source.scopedAgents(input.db, scope);
  const ids = await source.missionMembers(input.db, { missionId, agentId: input.event.agentId });
  return ids ? source.scopedAgents(input.db, scope, missionId) : [];
}

async function loadGraph(input) {
  if (process.env.GENOS_NERVOUS_ENABLED !== '1') return null;
  const scope = scopeOf(input.scope);
  if (!await source.hasTables(input.db, ['agent_relations', 'agents', 'workspaces'])) return null;
  const agents = await membersFor(input, scope);
  if (!agents.some(agent => agent.id === input.event.agentId)) return null;
  const ids = new Set(agents.map(agent => agent.id));
  const rows = await input.db.all(`SELECT source_agent_id,target_agent_id,relation_type,metadata_json
    FROM agent_relations WHERE organization_id=? AND project_id=? ORDER BY id LIMIT 513`,
  scope.organizationId, scope.projectId);
  if (rows.length > 512) throw new Error('GRAPH_CAPACITY');
  const edges = rows.filter(row => ids.has(row.source_agent_id) && ids.has(row.target_agent_id))
    .filter(row => active(row, Date.now()))
    .map(row => ({ from: row.source_agent_id, to: row.target_agent_id }));
  return source.graphOf(agents, edges, scope);
}

module.exports = { loadGraph };
