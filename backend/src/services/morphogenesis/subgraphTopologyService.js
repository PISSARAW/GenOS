'use strict';

const crypto = require('crypto');
const { getState } = require('../collectiveStateService');
const { TOPOLOGIES } = require('./topologyResolverService');

function subgraphError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateTopology(topology) {
  return Boolean(topology && TOPOLOGIES[topology]);
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function validateCreateCtx(ctx) {
  const { missionId, topology, members } = ctx;
  if (!missionId) throw subgraphError('MISSION_REQUIRED', 'missionId is required');
  if (!validateTopology(topology)) throw subgraphError('UNKNOWN_TOPOLOGY', `Unknown topology '${topology}'`);
  if (!Array.isArray(members) || members.length === 0) throw subgraphError('MEMBERS_REQUIRED', 'members must be a non-empty array');
}

function createSubgraph(ctx) {
  validateCreateCtx(ctx);
  const { missionId, topology, members, budget } = ctx;

  const state = getState();
  const id = generateId(`sg-${missionId}-${topology}`);
  const subgraph = {
    id,
    missionId,
    topology,
    members: [...members],
    budget: { allocated: budget || 0, consumed: 0 },
    evidence: [],
    bridges: [],
    status: 'active',
    createdAt: new Date().toISOString()
  };

  state.subgraphs.set(id, subgraph);
  state.topologyState.activeSubgraphs = [...(state.topologyState.activeSubgraphs || []), id];
  state.updatedAt = new Date().toISOString();

  return subgraph;
}

function validateBridgeEndpoints(ctx) {
  const { fromSubgraphId, toSubgraphId } = ctx;
  if (!fromSubgraphId || !toSubgraphId) throw subgraphError('BRIDGE_ENDPOINTS_REQUIRED', 'fromSubgraphId and toSubgraphId are required');
  if (fromSubgraphId === toSubgraphId) throw subgraphError('SELF_BRIDGE_FORBIDDEN', 'Cannot bridge a subgraph to itself');
}

function validateSubgraphExists(state, id, label) {
  const sg = state.subgraphs.get(id);
  if (!sg) throw subgraphError('SUBGRAPH_NOT_FOUND', `Subgraph '${id}' not found`);
  return sg;
}

function addBridge(ctx) {
  validateBridgeEndpoints(ctx);
  const { fromSubgraphId, toSubgraphId, protocol, dataFilter } = ctx;

  const state = getState();
  const from = validateSubgraphExists(state, fromSubgraphId, 'Source');
  const to = validateSubgraphExists(state, toSubgraphId, 'Target');

  const bridge = {
    id: generateId('bridge'),
    from: fromSubgraphId,
    to: toSubgraphId,
    protocol: protocol || 'default',
    dataFilter: dataFilter || [],
    status: 'active',
    createdAt: new Date().toISOString()
  };

  from.bridges = [...(from.bridges || []), bridge];
  state.updatedAt = new Date().toISOString();

  return bridge;
}

function validateMergeCtx(ctx) {
  const { subgraphIds, newTopology } = ctx;
  if (!Array.isArray(subgraphIds) || subgraphIds.length < 2) throw subgraphError('MERGE_REQUIRES_TWO', 'At least two subgraphIds are required');
  if (!validateTopology(newTopology)) throw subgraphError('UNKNOWN_TOPOLOGY', `Unknown topology '${newTopology}'`);
}

function collectMergeData(state, subgraphIds) {
  const members = [];
  let totalBudget = 0;
  const evidence = [];
  const bridges = [];

  for (const id of subgraphIds) {
    const sg = state.subgraphs.get(id);
    if (!sg) throw subgraphError('SUBGRAPH_NOT_FOUND', `Subgraph '${id}' not found`);
    members.push(...sg.members);
    totalBudget += sg.budget.allocated || 0;
    evidence.push(...(sg.evidence || []));
    bridges.push(...(sg.bridges || []));
    sg.status = 'merged';
  }

  return { members, totalBudget, evidence, bridges };
}

function mergeSubgraphs(ctx) {
  validateMergeCtx(ctx);
  const { subgraphIds, newTopology } = ctx;

  const state = getState();
  const { members, totalBudget, evidence, bridges } = collectMergeData(state, subgraphIds);

  const merged = {
    id: generateId(`sg-merged-${newTopology}`),
    missionId: state.mission ? (state.mission.id || 'merged') : 'merged',
    topology: newTopology,
    members: [...new Set(members)],
    budget: { allocated: totalBudget, consumed: 0 },
    evidence,
    bridges: bridges.filter(b => !subgraphIds.includes(b.from) || !subgraphIds.includes(b.to)),
    status: 'active',
    mergedFrom: [...subgraphIds],
    createdAt: new Date().toISOString()
  };

  state.subgraphs.set(merged.id, merged);
  state.topologyState.activeSubgraphs = [
    ...(state.topologyState.activeSubgraphs || []).filter(id => !subgraphIds.includes(id)),
    merged.id
  ];
  state.updatedAt = new Date().toISOString();

  return merged;
}

function validateSplitCtx(ctx) {
  const { subgraphId, partitionCriteria } = ctx;
  if (!subgraphId) throw subgraphError('SUBGRAPH_ID_REQUIRED', 'subgraphId is required');
  if (!partitionCriteria || !partitionCriteria.field) throw subgraphError('CRITERIA_REQUIRED', 'partitionCriteria.field is required');
}

function partitionMembers(sg, field) {
  const groups = new Map();
  for (const member of sg.members) {
    const key = member[field] || 'default';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(member);
  }
  return groups;
}

function createSplitSubgraphs(state, sg, groups) {
  const splitSubgraphs = [];
  let i = 0;
  for (const [key, members] of groups) {
    const newId = `${sg.id}-split-${i}`;
    const split = {
      id: newId,
      missionId: sg.missionId,
      topology: sg.topology,
      members,
      budget: { allocated: Math.floor((sg.budget.allocated || 0) / groups.size), consumed: 0 },
      evidence: [],
      bridges: [],
      status: 'active',
      splitFrom: sg.id,
      splitKey: key,
      createdAt: new Date().toISOString()
    };
    state.subgraphs.set(newId, split);
    splitSubgraphs.push(split);
    i++;
  }
  return splitSubgraphs;
}

function splitSubgraph(ctx) {
  validateSplitCtx(ctx);
  const { subgraphId, partitionCriteria } = ctx;

  const state = getState();
  const sg = validateSubgraphExists(state, subgraphId, 'Subgraph');

  const groups = partitionMembers(sg, partitionCriteria.field);
  const splitSubgraphs = createSplitSubgraphs(state, sg, groups);

  sg.status = 'split';
  state.topologyState.activeSubgraphs = [
    ...(state.topologyState.activeSubgraphs || []).filter(id => id !== subgraphId),
    ...splitSubgraphs.map(s => s.id)
  ];
  state.updatedAt = new Date().toISOString();

  return splitSubgraphs;
}

function getActiveSubgraphs(missionId) {
  const state = getState();
  const active = [];
  for (const [, sg] of state.subgraphs) {
    if (sg.status === 'active' && (!missionId || sg.missionId === missionId)) {
      active.push(sg);
    }
  }
  return active;
}

function getBridgeData(fromId, toId, dataType) {
  const state = getState();
  const from = validateSubgraphExists(state, fromId, 'Source');

  const bridge = (from.bridges || []).find(b => b.to === toId);
  if (!bridge) throw subgraphError('BRIDGE_NOT_FOUND', `No bridge from '${fromId}' to '${toId}'`);

  const to = validateSubgraphExists(state, toId, 'Target');

  const filter = bridge.dataFilter || [];
  const allowed = filter.length === 0 || filter.includes(dataType);

  return {
    bridge: bridge.id,
    from: fromId,
    to: toId,
    protocol: bridge.protocol,
    data: allowed ? (to.evidence || []).filter(e => !dataType || e.type === dataType) : [],
    filtered: !allowed,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  createSubgraph,
  addBridge,
  mergeSubgraphs,
  splitSubgraph,
  getActiveSubgraphs,
  getBridgeData
};
