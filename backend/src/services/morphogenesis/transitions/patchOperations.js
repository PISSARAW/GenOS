'use strict';
const operations = require('./patchGraphOperations');
const { node, edge, nonEmpty } = operations;

function changeBudget(graph, op) {
  const target = node(graph, op.nodeId);
  const next = { ...target.budget };
  if (!op.budgetDelta || typeof op.budgetDelta !== 'object') throw new Error('CHANGE_BUDGET requires budgetDelta');
  for (const [key, delta] of Object.entries(op.budgetDelta)) {
    const value = (next[key] || 0) + delta;
    if (!Number.isFinite(delta) || !Number.isFinite(value) || value < 0) throw new Error('Invalid budget delta: ' + key);
    next[key] = value;
  }
  target.budget = next;
}
function resizePopulation(graph, op) {
  const target = node(graph, op.nodeId);
  if (!Number.isInteger(op.size) || op.size < 0) throw new Error('RESIZE_POPULATION requires a non-negative integer size');
  const workers = [...(target.workers || [])];
  if (op.size <= workers.length) { target.workers = workers.slice(0, op.size); return; }
  if (!Array.isArray(op.newWorkers) || op.newWorkers.length !== op.size - workers.length) {
    throw new Error('Population growth requires admitted newWorkers');
  }
  const grown = workers.concat(structuredClone(op.newWorkers));
  const ids = grown.map(worker => nonEmpty(worker.id || worker.individualId, 'worker id'));
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate worker in population');
  target.workers = grown;
}
function migrateWorker(graph, op) {
  const source = node(graph, op.nodeId);
  const target = node(graph, op.targetNodeId);
  const workers = source.workers || [];
  const worker = workers.find(item => (item.id || item.individualId) === op.workerId);
  if (!worker) throw new Error('MIGRATE_WORKER source worker is missing');
  if ((target.workers || []).some(item => (item.id || item.individualId) === op.workerId)) throw new Error('Worker already exists in target');
  target.workers = [...(target.workers || []), structuredClone(worker)];
  source.workers = workers.filter(item => item !== worker);
}
function migrateState(graph, op) {
  const source = node(graph, op.fromNodeId);
  const target = node(graph, op.toNodeId);
  if (source === target) throw new Error('MIGRATE_STATE requires different nodes');
  if (!op.stateData || typeof op.stateData !== 'object') throw new Error('MIGRATE_STATE requires stateData');
  target.state = { ...target.state, ...structuredClone(op.stateData) };
  if (op.disposition === 'move') {
    for (const key of Object.keys(op.stateData)) delete source.state[key];
  }
}
function changeTopology(graph, op) {
  const target = node(graph, op.nodeId);
  target.topology = nonEmpty(op.newTopology, 'newTopology');
  target.variant = op.newVariant || null;
  target.kind = 'TOPOLOGY'; target.operator = null;
}
function changeLifecycle(graph, op, lifecycle) {
  const target = node(graph, op.nodeId);
  target.lifecycle = lifecycle;
  target.lifecycleChangedAt = new Date().toISOString();
}
function setPolicy(graph, op, field) {
  if (op.newPolicy === undefined) throw new Error('newPolicy is required');
  node(graph, op.nodeId)[field] = structuredClone(op.newPolicy);
}
function setAuthority(graph, op) {
  if (!Array.isArray(op.newAuthorityBoundary)) throw new Error('newAuthorityBoundary must be an array');
  node(graph, op.nodeId).authorityBoundary = [...op.newAuthorityBoundary];
}
function rewire(graph, op) {
  const target = edge(graph, op.edgeId);
  const from = op.newFrom || target.fromNodeId;
  const to = op.newTo || target.toNodeId;
  node(graph, from); node(graph, to);
  if (from === to) throw new Error('REWIRE cannot connect a node to itself');
  if (target.type === 'CONTAINS') throw new Error('Use MOVE_SUBTREE to rewire containment');
  target.fromNodeId = from; target.toNodeId = to;
}
function unnested(graph, op) {
  const child = node(graph, op.childId);
  if (child.parentNodeId !== op.parentId) throw new Error('UNNEST parent mismatch');
  operations.detach(graph, child.nodeId);
}
function removeEdge(graph, op) {
  const target = edge(graph, op.edgeId);
  if (target.type === 'CONTAINS') throw new Error('Use UNNEST to remove containment');
  graph.edges = graph.edges.filter(item => item !== target);
}
function removeBridge(graph, op) {
  node(graph, op.fromNodeId); node(graph, op.toNodeId);
  const bridges = graph.edges.filter(item => item.fromNodeId === op.fromNodeId
    && item.toNodeId === op.toNodeId && item.properties?.bridge === true);
  if (!bridges.length) throw new Error('REMOVE_BRIDGE references a missing bridge');
  graph.edges = graph.edges.filter(item => !bridges.includes(item));
}
function addGraphEdge(graph, op) {
  if (op.edge?.type === 'CONTAINS') throw new Error('Use NEST to add containment');
  return operations.addEdge(graph, op.edge);
}
const handlers = {
  ADD_NODE: (g, op) => operations.addNode(g, op.node), REMOVE_NODE: operations.removeNode,
  REPLACE_NODE: operations.replaceNode, SPLIT: operations.split, MERGE: operations.merge,
  NEST: (g, op) => operations.attach(g, op.childId, op.parentId), UNNEST: unnested,
  MOVE_SUBTREE: (g, op) => operations.attach(g, op.nodeId, op.newParentId),
  ADD_EDGE: addGraphEdge, REMOVE_EDGE: removeEdge, REWIRE: rewire,
  CHANGE_TOPOLOGY: changeTopology,
  CHANGE_VARIANT: (g, op) => { node(g, op.nodeId).variant = nonEmpty(op.newVariant, 'newVariant'); },
  CHANGE_BUDGET: changeBudget, RESIZE_POPULATION: resizePopulation,
  MIGRATE_WORKER: migrateWorker, MIGRATE_STATE: migrateState,
  ADD_BRIDGE: (g, op) => operations.addEdge(g, { type: 'COMMUNICATES', fromNodeId: op.fromNodeId,
    toNodeId: op.toNodeId, properties: { adapter: op.adapter, bridge: true } }),
  REMOVE_BRIDGE: removeBridge,
  CHANGE_COMMUNICATION_POLICY: (g, op) => setPolicy(g, op, 'communicationPolicy'),
  CHANGE_EVIDENCE_POLICY: (g, op) => setPolicy(g, op, 'evidencePolicy'),
  FREEZE: (g, op) => changeLifecycle(g, op, 'frozen'), THAW: (g, op) => changeLifecycle(g, op, 'active'),
  QUIESCE: (g, op) => changeLifecycle(g, op, 'quiesced'), PROMOTE: setAuthority, DEMOTE: setAuthority
};
function applyOperation(graph, op) {
  const handler = handlers[op?.type];
  if (!handler) throw new Error('Unsupported patch operation: ' + op?.type);
  const candidate = structuredClone(graph);
  handler(candidate, op);
  Object.assign(graph, candidate);
}
module.exports = { applyOperation };
