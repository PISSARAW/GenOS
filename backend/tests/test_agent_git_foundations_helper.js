'use strict';

const dbModule = require('../src/db');

const agents = { a1: { id: 'a1', workspace_id: 'ws', name: 'Agent1', role: 'worker', status: 'idle', cognitive_budget: 50, created_at: '2026-01-01' } };
let objectStore = {}, refStore = {}, parentLinks = {}, genomeDecisionsStore = {};

function resetStores() {
  for (const k in objectStore) delete objectStore[k];
  for (const k in refStore) delete refStore[k];
  for (const k in parentLinks) delete parentLinks[k];
  for (const k in genomeDecisionsStore) delete genomeDecisionsStore[k];
}

function makeState(overrides = {}) {
  return { schema: 'genos.agent-git-state/v1', agent: agents.a1, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [], children: [], ...overrides };
}

function mockGet(sql, args) {
  if (sql.includes('FROM agents a')) return agents[args[0]] || null;
  if (sql.includes('FROM agent_git_objects')) return objectStore[args[0]] || null;
  if (sql.includes('FROM agent_git_refs')) {
    if (sql.includes('object_id')) return { object_id: refStore[`${args[0]}:${args[1]}`]?.object_id || null };
    return refStore[`${args[0]}:${args[1]}`] || null;
  }
  if (sql.includes('COUNT(*)')) return { count: Object.keys(objectStore).length };
  return null;
}

function mockAll(sql, args) {
  if (sql.includes('agent_git_objects')) return Object.values(objectStore).filter(o => o.agent_id === args[0]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (sql.includes('genome_decisions')) { const agentId = args[0]; return Object.values(genomeDecisionsStore).filter(d => d.created_by === agentId); }
  if (sql.includes('agent_git_commit_parents')) {
    const commitId = args[0];
    const explicitParents = parentLinks[commitId] || [];
    const obj = objectStore[commitId];
    const implicitParents = obj?.parent_commit_id ? [obj.parent_commit_id] : [];
    const allParents = [...new Set([...explicitParents, ...implicitParents])];
    return allParents.map(p => ({ commit_id: commitId, parent_commit_id: p }));
  }
  return [];
}

function handleObjectInsert(args) {
  objectStore[args[0]] = { id: args[0], agent_id: args[1], workspace_id: args[2], object_kind: args[3], ref_name: args[4], remote_name: args[5], state_hash: args[6], state_json: args[7], metadata_json: args[8], signature: args[9], created_by: args[10], parent_commit_id: args[11] || null };
  return { changes: 1 };
}

function handleRefInsert(args) {
  refStore[args[0]] = { ref_key: args[0], agent_id: args[1], ref_name: args[2], object_id: args[3], version: args[4] };
  return { changes: 1 };
}

function handleParentLink(args) {
  parentLinks[args[0]] = parentLinks[args[0]] || [];
  if (!parentLinks[args[0]].includes(args[1])) parentLinks[args[0]].push(args[1]);
  return { changes: 1 };
}

function handleDecisionInsert(args) {
  genomeDecisionsStore[args[0]] = { id: args[0], title: args[1], content: args[2], created_by: args[4] };
  return { changes: 1 };
}

function handleDecisionDelete(args) {
  const agentId = args[0];
  for (const k in genomeDecisionsStore) if (genomeDecisionsStore[k].created_by === agentId) delete genomeDecisionsStore[k];
  return { changes: 1 };
}

function handleRefUpdate(args) {
  const key = `${args[1]}:${args[2]}`;
  if (refStore[key]) refStore[key].object_id = args[0];
  return { changes: 1 };
}

function handleRefSelect(args) {
  const key = `${args[0]}:${args[1]}`;
  return { object_id: refStore[key]?.object_id || null };
}

function mockRun(sql, args) {
  if (sql.includes('INSERT INTO agent_git_objects')) return handleObjectInsert(args);
  if (sql.includes('INSERT INTO agent_git_refs')) return handleRefInsert(args);
  if (sql.includes('agent_git_commit_parents')) return handleParentLink(args);
  if (sql.includes('INSERT INTO genome_decisions')) return handleDecisionInsert(args);
  if (sql.includes('DELETE FROM genome_decisions')) return handleDecisionDelete(args);
  if (sql.includes('UPDATE agent_git_refs')) return handleRefUpdate(args);
  if (sql.includes('SELECT object_id FROM agent_git_refs')) return handleRefSelect(args);
  return { changes: 1 };
}

function installMock() {
  dbModule.getDatabase = async () => ({
    get: async (sql, ...args) => mockGet(sql, args),
    all: async (sql, ...args) => mockAll(sql, args),
    run: async (sql, ...args) => mockRun(sql, args),
    exec: async () => ({ changes: 0 })
  });
}

function clearServiceCache() {
  Object.keys(require.cache).forEach(key => {
    if (key.includes('agentGitService') || key.includes('canonical') || key.includes('commitGraph') || key.includes('dagOperations')) {
      delete require.cache[key];
    }
  });
}

module.exports = { resetStores, makeState, installMock, clearServiceCache, agents, objectStore };
