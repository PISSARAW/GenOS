'use strict';

const topologyStore = require('../../topologySessionStore');

async function project(db, graphStore, sessionId) {
  await ensureTable(db);
  const graph = await topologyStore.loadRhizomeGraph(db, sessionId);
  const previous = await loadProjectionState(db, sessionId);
  const nodes = graph.nodes.map((node) => projectedNode(sessionId, graph.graphVersion, node));
  const edges = graph.edges.map((edge) => projectedEdge(sessionId, graph.graphVersion, edge));
  await removeStale(graphStore, previous, { nodes, edges });
  for (const node of nodes) await graphStore.upsertNode(node);
  for (const edge of edges) await graphStore.upsertEdge(edge);
  await saveProjectionState(db, { sessionId, graphVersion: graph.graphVersion, nodes, edges });
  return { sessionId, graphVersion: graph.graphVersion, nodeCount: nodes.length, edgeCount: edges.length };
}

function projectedNode(sessionId, graphVersion, node) {
  return {
    id: nodeId(sessionId, node.nodeId),
    label: 'Capability',
    properties: { rhizomeSessionId: sessionId, rhizomeNodeId: node.nodeId, graphVersion, ...node }
  };
}

function projectedEdge(sessionId, graphVersion, edge) {
  return {
    id: edgeId(sessionId, edge.edgeId),
    source: nodeId(sessionId, edge.from),
    target: nodeId(sessionId, edge.to),
    label: 'WORLD_GRAPH_EDGE',
    properties: { rhizomeSessionId: sessionId, rhizomeEdgeId: edge.edgeId, relation: edge.relation, graphVersion, ...edge }
  };
}

async function removeStale(graphStore, previous, current) {
  const currentEdges = new Set(current.edges.map((edge) => edge.id));
  const currentNodes = new Set(current.nodes.map((node) => node.id));
  for (const id of previous.edgeIds.filter((value) => !currentEdges.has(value))) await graphStore.deleteEdge(id);
  for (const id of previous.nodeIds.filter((value) => !currentNodes.has(value))) await graphStore.deleteNode(id);
}

async function ensureTable(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS rhizome_graph_projection_state (
    session_id TEXT PRIMARY KEY, graph_version INTEGER, node_ids_json TEXT NOT NULL,
    edge_ids_json TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function loadProjectionState(db, sessionId) {
  const row = await db.get('SELECT node_ids_json, edge_ids_json FROM rhizome_graph_projection_state WHERE session_id = ?', sessionId);
  if (!row) return { nodeIds: [], edgeIds: [] };
  return { nodeIds: parseIds(row.node_ids_json), edgeIds: parseIds(row.edge_ids_json) };
}

async function saveProjectionState(db, projection) {
  const { sessionId, graphVersion, nodes, edges } = projection;
  await db.run(`INSERT INTO rhizome_graph_projection_state (session_id, graph_version, node_ids_json, edge_ids_json, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(session_id) DO UPDATE SET
    graph_version = excluded.graph_version, node_ids_json = excluded.node_ids_json,
    edge_ids_json = excluded.edge_ids_json, updated_at = CURRENT_TIMESTAMP`,
  sessionId, graphVersion, JSON.stringify(nodes.map((node) => node.id)), JSON.stringify(edges.map((edge) => edge.id)));
}

function parseIds(value) {
  try { const ids = JSON.parse(value || '[]'); return Array.isArray(ids) ? ids : []; } catch (_) { return []; }
}

function nodeId(sessionId, id) { return `rhizome:${sessionId}:node:${id}`; }
function edgeId(sessionId, id) { return `rhizome:${sessionId}:edge:${id}`; }

module.exports = { project, projectedNode, projectedEdge };
