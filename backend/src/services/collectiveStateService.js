'use strict';

const { getDatabase, withTransaction } = require('../db');

const SNAPSHOT_LIMIT = 10;
const STATE_KEY = 'collective_state_v1';

function createRingBuffer(limit) {
  const buffer = [];
  return {
    push(item) {
      buffer.push(item);
      if (buffer.length > limit) buffer.shift();
    },
    list() {
      return buffer.slice();
    },
    clear() {
      buffer.length = 0;
    },
    get length() {
      return buffer.length;
    }
  };
}

function createState() {
  return {
    mission: null,
    agents: new Map(),
    subgraphs: new Map(),
    daemons: new Map(),
    capabilityState: new Map(),
    topologyState: { organization: null, activeSubgraphs: [] },
    relationGraph: new Map(),
    evidenceState: new Map(),
    uncertaintyState: new Map(),
    budgets: { total: 0, allocated: 0, remaining: 0, perAgent: {} },
    resources: { tokens: 0, compute: 0, storage: 0 },
    currentMorphologyVersion: 0,
    updatedAt: new Date().toISOString()
  };
}

let state = createState();
let snapshots = createRingBuffer(SNAPSHOT_LIMIT);

function mapToObj(map) {
  const obj = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

function objToMap(obj) {
  const map = new Map();
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      map.set(key, value);
    }
  }
  return map;
}

function serializeState(s) {
  return JSON.stringify({
    mission: s.mission,
    agents: mapToObj(s.agents),
    subgraphs: mapToObj(s.subgraphs),
    daemons: mapToObj(s.daemons),
    capabilityState: mapToObj(s.capabilityState),
    topologyState: s.topologyState,
    relationGraph: mapToObj(s.relationGraph),
    evidenceState: mapToObj(s.evidenceState),
    uncertaintyState: mapToObj(s.uncertaintyState),
    budgets: s.budgets,
    resources: s.resources,
    currentMorphologyVersion: s.currentMorphologyVersion,
    updatedAt: s.updatedAt
  });
}

function relationFromObj(obj) {
  const graph = new Map();
  for (const [key, inner] of Object.entries(obj)) {
    graph.set(key, new Map(Object.entries(inner)));
  }
  return graph;
}

function deserializeState(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  const s = createState();
  s.mission = raw.mission || null;
  s.agents = objToMap(raw.agents);
  s.subgraphs = objToMap(raw.subgraphs);
  s.daemons = objToMap(raw.daemons);
  s.capabilityState = objToMap(raw.capabilityState);
  s.topologyState = raw.topologyState || s.topologyState;
  s.relationGraph = raw.relationGraph ? relationFromObj(raw.relationGraph) : new Map();
  s.evidenceState = objToMap(raw.evidenceState);
  s.uncertaintyState = objToMap(raw.uncertaintyState);
  s.budgets = raw.budgets || s.budgets;
  s.resources = raw.resources || s.resources;
  s.currentMorphologyVersion = raw.currentMorphologyVersion || 0;
  s.updatedAt = raw.updatedAt || new Date().toISOString();
  return s;
}

function getState() {
  return state;
}

function defaultAgent(id) {
  return {
    id,
    phenotype: null,
    status: 'idle',
    capabilities: [],
    lease: null,
    parent: null,
    children: [],
    budget: { allocated: 0, consumed: 0 },
    workspace: null
  };
}

function updateAgent(agentId, patch) {
  const existing = state.agents.get(agentId) || defaultAgent(agentId);
  state.agents.set(agentId, { ...existing, ...patch, id: agentId });
  state.updatedAt = new Date().toISOString();
}

function addAgent(agent) {
  if (!agent || !agent.id) {
    throw new Error('addAgent requires an agent with an id.');
  }
  state.agents.set(agent.id, {
    ...defaultAgent(agent.id),
    ...agent
  });
  state.updatedAt = new Date().toISOString();
}

function removeAgent(agentId) {
  state.agents.delete(agentId);
  state.relationGraph.delete(agentId);
  for (const edges of state.relationGraph.values()) {
    edges.delete(agentId);
  }
  delete state.budgets.perAgent[agentId];
  state.updatedAt = new Date().toISOString();
}

function getAgent(agentId) {
  return state.agents.get(agentId) || null;
}

function getSubgraph(subgraphId) {
  return state.subgraphs.get(subgraphId) || null;
}

function addRelation(from, to, relation) {
  if (!from || !to || !relation) {
    throw new Error('addRelation requires from, to and relation.');
  }
  if (!state.relationGraph.has(from)) {
    state.relationGraph.set(from, new Map());
  }
  state.relationGraph.get(from).set(to, relation);
  state.updatedAt = new Date().toISOString();
}

function getRelations(agentId) {
  const edges = state.relationGraph.get(agentId);
  if (!edges) return [];
  const out = [];
  for (const [targetId, relation] of edges.entries()) {
    out.push({ target: targetId, ...relation });
  }
  return out;
}

function createSnapshot() {
  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  snapshots.push({
    id: snapshotId,
    state: serializeState(state),
    createdAt: new Date().toISOString()
  });
  return snapshotId;
}

function rollback(snapshotId) {
  const target = snapshots.list().find((s) => s.id === snapshotId);
  if (!target) return false;
  state = deserializeState(target.state);
  state.updatedAt = new Date().toISOString();
  return true;
}

async function ensureTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS collective_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function persist() {
  const db = await getDatabase();
  await ensureTable(db);
  await withTransaction(db, async (tx) => {
    await tx.run(
      `INSERT INTO collective_state(key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      STATE_KEY, serializeState(state)
    );
  });
}

async function load() {
  const db = await getDatabase();
  await ensureTable(db);
  const row = await db.get('SELECT value FROM collective_state WHERE key = ?', STATE_KEY);
  if (!row) return;
  state = deserializeState(row.value);
  snapshots = createRingBuffer(SNAPSHOT_LIMIT);
}

function listSnapshots() {
  return snapshots.list();
}

function setMission(mission) {
  state.mission = mission;
  state.updatedAt = new Date().toISOString();
}

function setTopology(topology) {
  state.topologyState = { ...state.topologyState, ...topology };
  state.updatedAt = new Date().toISOString();
}

function updateBudgets(budgets) {
  state.budgets = { ...state.budgets, ...budgets };
  state.updatedAt = new Date().toISOString();
}

function updateResources(resources) {
  state.resources = { ...state.resources, ...resources };
  state.updatedAt = new Date().toISOString();
}

module.exports = {
  getState,
  updateAgent,
  addAgent,
  removeAgent,
  getAgent,
  getSubgraph,
  addRelation,
  getRelations,
  createSnapshot,
  rollback,
  persist,
  load,
  listSnapshots,
  setMission,
  setTopology,
  updateBudgets,
  updateResources,
  serializeState,
  deserializeState,
  SNAPSHOT_LIMIT
};
