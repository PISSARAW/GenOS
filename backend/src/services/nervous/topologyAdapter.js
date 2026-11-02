'use strict';

const { scopeOf, identifier } = require('./contract');
const source = require('./graphSource');
const MODES = Object.freeze(['trinity', 'a_team', 'biocenose', 'syncytium', 'holobionte', 'metapopulation', 'rhizome', 'biome']);

function names(values) {
  return [...new Set(values.flat().filter(value => typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,159}$/.test(value)))].slice(0, 32);
}

function binding(input) {
  const raw = String(input.context.request?.mode || '').toLowerCase().replace(/[-\s]+/g, '_');
  const mode = { ateam: 'a_team', holobiont: 'holobionte' }[raw] || raw;
  if (!MODES.includes(mode)) return null;
  return { schemaVersion: 1, mode, missionId: identifier(input.context.missionId, 'missionId'),
    parentId: identifier(input.context.orchestratorId, 'parentId'),
    aliases: names([input.workerId, input.member.role, input.member.label, input.member.memberId, input.member.subSystem]),
    dependsOn: names([input.member.dependsOn || [], input.member.consumes || []]) };
}

async function recordWorker(input) {
  if (process.env.GENOS_NERVOUS_ENABLED !== '1') return { status: 'DISABLED' };
  try {
    const record = binding(input);
    if (!record) return { status: 'UNSUPPORTED' };
    return await persistBinding(input, record);
  } catch (_) { return { status: 'UNAVAILABLE' }; }
}

async function persistBinding(input, record) {
  const row = await input.db.get(`SELECT a.metadata_json FROM agents a
    JOIN mission_agents ma ON ma.agent_id=a.id JOIN workspaces w ON w.id=a.workspace_id
    JOIN agents p ON p.id=a.parent_agent_id JOIN workspaces pw ON pw.id=p.workspace_id
    WHERE a.id=? AND ma.mission_id=? AND p.id=?
      AND w.organization_id=pw.organization_id AND w.project_id=pw.project_id`,
  input.workerId, record.missionId, record.parentId);
  if (!row) return { status: 'NOT_BOUND' };
  const updated = { ...source.metadata(row), nervousTopology: record };
  const result = await input.db.run(`UPDATE agents SET metadata_json=? WHERE id=? AND metadata_json=?`,
    JSON.stringify(updated), input.workerId, row.metadata_json);
  return { status: result.changes === 1 ? 'RECORDED' : 'CONCURRENT_CHANGE' };
}

async function missionFor(input) {
  const actor = await input.db.get(`SELECT a.metadata_json FROM agents a JOIN workspaces w ON w.id=a.workspace_id
    WHERE a.id=? AND w.organization_id=? AND w.project_id=?`,
  input.event.agentId, input.scope.organizationId, input.scope.projectId);
  if (!actor) return null;
  const bound = source.metadata(actor).nervousTopology;
  const requested = input.event.payload?.missionId ?? input.event.payload?.mission_id;
  if (bound && requested !== undefined && bound.missionId !== requested) throw new Error('TOPOLOGY_MISSION_MISMATCH');
  return requested ?? bound?.missionId ?? null;
}

function links(rows) {
  const ids = new Set(rows.map(row => row.id));
  const edges = [];
  for (const row of rows) {
    const record = source.metadata(row).nervousTopology;
    if (!record) continue;
    if (ids.has(record.parentId)) edges.push({ from: row.id, to: record.parentId });
    for (const dependency of record.dependsOn) addDependency({ rows, row, dependency, edges });
  }
  return edges;
}

function currentBinding(row, missionId) {
  const record = source.metadata(row).nervousTopology;
  if (!record || record.missionId !== missionId) return false;
  if (record.schemaVersion !== 1 || record.parentId !== row.parent_agent_id) throw new Error('TOPOLOGY_BINDING_CONFLICT');
  return true;
}

function addDependency(input) {
  const owners = input.rows.filter(row => source.metadata(row).nervousTopology?.aliases.includes(input.dependency));
  if (owners.length !== 1 || owners[0].id === input.row.id) return;
  input.edges.push({ from: owners[0].id, to: input.row.id });
}

async function loadGraph(input) {
  if (process.env.GENOS_NERVOUS_ENABLED !== '1') return null;
  const scope = scopeOf(input.scope);
  if (!await source.hasTables(input.db, ['agents', 'workspaces', 'mission_agents', 'missions'])) return null;
  const missionId = await missionFor({ ...input, scope });
  if (!missionId) return null;
  const members = await source.missionMembers(input.db, { missionId, agentId: input.event.agentId });
  if (!members) throw new Error('TOPOLOGY_MISSION_MISMATCH');
  const rows = await source.scopedAgents(input.db, scope, missionId);
  const bound = rows.filter(row => currentBinding(row, missionId));
  if (!bound.length) return null;
  const modes = new Set(bound.map(row => source.metadata(row).nervousTopology.mode));
  if (modes.size !== 1 || !MODES.includes([...modes][0])) throw new Error('TOPOLOGY_BINDING_CONFLICT');
  const parents = new Set(bound.map(row => source.metadata(row).nervousTopology.parentId));
  const selected = rows.filter(row => bound.includes(row) || parents.has(row.id));
  return source.graphOf(selected, links(selected), scope);
}

module.exports = { MODES, recordWorker, loadGraph };
