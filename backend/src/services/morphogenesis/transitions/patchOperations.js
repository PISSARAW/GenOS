'use strict';

const { randomUUID } = require('crypto');

function findNode(g, id) { return g.nodes.find(n => n.nodeId === id); }
function filterNodes(g, fn) { g.nodes = g.nodes.filter(fn); }
function filterEdges(g, fn) { g.edges = g.edges.filter(fn); }
function pushEdge(g, e) { g.edges.push({ ...e, edgeId: e.edgeId || randomUUID() }); }
function setNodeLifecycle(n, lc, ts) { n.lifecycle = lc; n[ts] = new Date().toISOString(); }
function setNodePolicy(n, field, val) { n[field] = val; }

function simpleHandler(graph, op, makeFn) { const fn = makeFn(op); if (fn) fn(graph, op); }
function structuralHandler(graph, op, makeFn) { const fn = makeFn(op); if (fn) fn(graph, op); }

const SIMPLE_OPS = {
  ADD_NODE: (op) => (g) => g.nodes.push({ ...op.node, nodeId: op.node.nodeId || randomUUID() }),
  REMOVE_NODE: (op) => (g) => { filterNodes(g, n => n.nodeId !== op.nodeId); filterEdges(g, e => e.fromNodeId !== op.nodeId && e.toNodeId !== op.nodeId); },
  REPLACE_NODE: (op) => (g) => { const i = g.nodes.findIndex(n => n.nodeId === op.nodeId); if (i >= 0) g.nodes[i] = { ...g.nodes[i], ...op.newNode, nodeId: op.nodeId }; },
  ADD_EDGE: (op) => (g) => pushEdge(g, op.edge),
  REMOVE_EDGE: (op) => (g) => filterEdges(g, e => e.edgeId !== op.edgeId),
  REWIRE: (op) => (g) => { const e = g.edges.find(e => e.edgeId === op.edgeId); if (e) { e.fromNodeId = op.newFrom || e.fromNodeId; e.toNodeId = op.newTo || e.toNodeId; } },
  CHANGE_TOPOLOGY: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) { n.topology = op.newTopology; n.variant = op.newVariant || n.variant; n.kind = 'TOPOLOGY'; } },
  CHANGE_VARIANT: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) n.variant = op.newVariant; },
  CHANGE_BUDGET: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) n.budget = { ...n.budget, ...op.budgetDelta }; },
  RESIZE_POPULATION: (op) => (g) => { const n = findNode(g, op.nodeId); if (!n) return; if (!Number.isInteger(op.size) || op.size < 0) throw new Error('RESIZE_POPULATION requires a non-negative integer size'); n.workers = (n.workers || []).slice(0, op.size); },
  CHANGE_COMMUNICATION_POLICY: (op) => (g) => setNodePolicy(findNode(g, op.nodeId), 'communicationPolicy', op.newPolicy),
  CHANGE_EVIDENCE_POLICY: (op) => (g) => setNodePolicy(findNode(g, op.nodeId), 'evidencePolicy', op.newPolicy),
  FREEZE: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) setNodeLifecycle(n, 'frozen', 'frozenAt'); },
  THAW: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) setNodeLifecycle(n, 'active', 'thawedAt'); },
  QUIESCE: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) setNodeLifecycle(n, 'quiesced', 'quiescedAt'); },
  PROMOTE: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) n.authorityBoundary = op.newAuthorityBoundary; },
  DEMOTE: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) n.authorityBoundary = op.newAuthorityBoundary; }
};

const STRUCTURAL_OPS = {
  NEST: (op) => (g) => { const p = findNode(g, op.parentId); const c = findNode(g, op.childId); if (p && c) { c.parentNodeId = op.parentId; p.children = [...(p.children || []), op.childId]; pushEdge(g, { type: 'CONTAINS', fromNodeId: op.parentId, toNodeId: op.childId }); } },
  UNNEST: (op) => (g) => { const p = findNode(g, op.parentId); const c = findNode(g, op.childId); if (p && c) { c.parentNodeId = null; p.children = (p.children || []).filter(id => id !== op.childId); filterEdges(g, e => !(e.fromNodeId === op.parentId && e.toNodeId === op.childId && e.type === 'CONTAINS')); } },
  SPLIT: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) { const [l, r] = op.splitResult; g.nodes.push(l, r); filterNodes(g, n => n.nodeId !== op.nodeId); } },
  MERGE: (op) => (g) => { const ns = op.nodeIds.map(id => findNode(g, id)).filter(Boolean); if (ns.length >= 2) { const m = { ...ns[0], nodeId: randomUUID(), children: ns.flatMap(n => n.children || []) }; g.nodes.push(m); filterNodes(g, n => !op.nodeIds.includes(n.nodeId)); } },
  MOVE_SUBTREE: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) n.parentNodeId = op.newParentId; },
  ADD_BRIDGE: (op) => (g) => pushEdge(g, { type: 'COMMUNICATES', fromNodeId: op.fromNodeId, toNodeId: op.toNodeId, properties: { adapter: op.adapter, bridge: true } }),
  REMOVE_BRIDGE: (op) => (g) => filterEdges(g, e => !(e.fromNodeId === op.fromNodeId && e.toNodeId === op.toNodeId && e.properties && e.properties.bridge === true)),
  MIGRATE_WORKER: (op) => (g) => { const n = findNode(g, op.nodeId); if (n) { n.workers = n.workers?.filter(w => w.id !== op.workerId) || []; const t = findNode(g, op.targetNodeId); if (t) t.workers = [...(t.workers || []), { id: op.workerId, ...op.workerData }]; } },
  MIGRATE_STATE: (op) => (g) => { const s = findNode(g, op.fromNodeId); const t = findNode(g, op.toNodeId); if (s && t) t.state = { ...t.state, ...op.stateData }; }
};

const ALL_HANDLERS = { ...SIMPLE_OPS, ...STRUCTURAL_OPS };

function applyOperation(graph, op) {
  const make = ALL_HANDLERS[op.type];
  if (!make) throw new Error(`Unsupported patch operation: ${op.type}`);
  const apply = make(op);
  if (typeof apply === 'function') apply(graph, op);
}

module.exports = { applyOperation };