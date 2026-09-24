'use strict';

async function ensureGraphTables(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS rhizome_nodes (
    session_id TEXT NOT NULL, node_id TEXT NOT NULL, graph_version INTEGER NOT NULL,
    node_json TEXT NOT NULL, PRIMARY KEY(session_id, node_id)
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS rhizome_edges (
    session_id TEXT NOT NULL, edge_id TEXT NOT NULL, graph_version INTEGER NOT NULL,
    edge_json TEXT NOT NULL, PRIMARY KEY(session_id, edge_id)
  )`);
}

async function replaceGraph(db, sessionId, graph = {}) {
  await ensureGraphTables(db);
  await db.run('DELETE FROM rhizome_nodes WHERE session_id = ?', sessionId);
  await db.run('DELETE FROM rhizome_edges WHERE session_id = ?', sessionId);
  const version = Number(graph.graphVersion) || 0;
  for (const node of graph.nodes || []) {
    await db.run('INSERT INTO rhizome_nodes (session_id, node_id, graph_version, node_json) VALUES (?, ?, ?, ?)', sessionId, node.nodeId, version, JSON.stringify(node));
  }
  for (const edge of graph.edges || []) {
    await db.run('INSERT INTO rhizome_edges (session_id, edge_id, graph_version, edge_json) VALUES (?, ?, ?, ?)', sessionId, edge.edgeId, version, JSON.stringify(edge));
  }
}

async function loadGraph(db, sessionId) {
  await ensureGraphTables(db);
  const nodes = await db.all('SELECT node_json, graph_version FROM rhizome_nodes WHERE session_id = ? ORDER BY node_id', sessionId);
  const edges = await db.all('SELECT edge_json, graph_version FROM rhizome_edges WHERE session_id = ? ORDER BY edge_id', sessionId);
  const versionRow = nodes[0] || edges[0];
  return {
    nodes: nodes.map((row) => parse(row.node_json)),
    edges: edges.map((row) => parse(row.edge_json)),
    graphVersion: versionRow ? Number(versionRow.graph_version) : undefined
  };
}

function parse(value) {
  try { return JSON.parse(value); } catch (_) { return {}; }
}

async function deleteGraph(db, sessionId) {
  await ensureGraphTables(db);
  await db.run('DELETE FROM rhizome_nodes WHERE session_id = ?', sessionId);
  await db.run('DELETE FROM rhizome_edges WHERE session_id = ?', sessionId);
}

module.exports = { ensureGraphTables, replaceGraph, loadGraph, deleteGraph };
