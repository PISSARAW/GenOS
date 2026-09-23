'use strict';

/**
 * Graph Store — ADR 0034 D5.
 *
 * Persistance du graphe territorial dérivé. Idempotente par ids
 * déterministes : `territoryId::kind::path[::name]`.
 * Aucun LLM, aucune inférence — que du CRUD.
 */

const { migrateTerritoryGraph } = require('../../../db/migrations/migrateTerritoryGraph');

function nodeId(spec) {
  const base = `${spec.territoryId}::${spec.kind}::${spec.path}`;
  return spec.name ? `${base}::${spec.name}` : base;
}

function edgeId(link) {
  return `${link.territoryId}::${link.relation}::${link.sourceId}=>${link.targetId}`;
}

async function upsertNode(db, node) {
  await migrateTerritoryGraph(db);
  await db.run(
    `INSERT INTO territory_graph_nodes (id, territory_id, kind, path, name, symbol_kind, hash, stale, metadata_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       symbol_kind = excluded.symbol_kind, hash = excluded.hash,
       stale = 0, metadata_json = excluded.metadata_json, updated_at = datetime('now')`,
    node.id,
    node.territoryId,
    node.kind,
    node.path,
    node.name || null,
    node.symbolKind || null,
    node.hash || null,
    JSON.stringify(node.metadata || {})
  );
  return node.id;
}

async function upsertEdge(db, edge) {
  await migrateTerritoryGraph(db);
  await db.run(
    `INSERT INTO territory_graph_edges (id, territory_id, source_id, relation, target_id, metadata_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO NOTHING`,
    edge.id,
    edge.territoryId,
    edge.sourceId,
    edge.relation,
    edge.targetId,
    JSON.stringify(edge.metadata || {})
  );
  return edge.id;
}

async function listNodes(db, filter) {
  await migrateTerritoryGraph(db);
  const scoped = filter || {};
  if (scoped.path) {
    return db.all('SELECT * FROM territory_graph_nodes WHERE territory_id = ? AND path = ? ORDER BY id ASC', scoped.territoryId, scoped.path);
  }
  return db.all('SELECT * FROM territory_graph_nodes WHERE territory_id = ? ORDER BY id ASC', scoped.territoryId);
}

async function listEdges(db, filter) {
  await migrateTerritoryGraph(db);
  const scoped = filter || {};
  return db.all('SELECT * FROM territory_graph_edges WHERE territory_id = ? ORDER BY id ASC', scoped.territoryId);
}

async function deleteFileSubgraph(db, query) {
  await migrateTerritoryGraph(db);
  const nodes = await listNodes(db, { territoryId: query.territoryId, path: query.filePath });
  const ids = nodes.map((n) => n.id);
  let edgesRemoved = 0;
  for (const id of ids) {
    const res = await deleteOutgoingEdges(db, query, id);
    edgesRemoved += res;
  }
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM territory_graph_nodes WHERE id IN (${placeholders})`, ...ids);
  }
  return { nodesRemoved: ids.length, edgesRemoved };
}

async function deleteOutgoingEdges(db, query, nodeIdValue) {
  const rows = await db.all(
    'SELECT id FROM territory_graph_edges WHERE territory_id = ? AND source_id = ?',
    query.territoryId,
    nodeIdValue
  );
  for (const row of rows || []) {
    await db.run('DELETE FROM territory_graph_edges WHERE id = ?', row.id);
  }
  return (rows || []).length;
}

async function deleteIncomingEdges(db, query) {
  await migrateTerritoryGraph(db);
  const ids = query.nodeIds || [];
  let removed = 0;
  for (const id of ids) {
    const rows = await db.all(
      'SELECT id FROM territory_graph_edges WHERE territory_id = ? AND target_id = ?',
      query.territoryId,
      id
    );
    for (const row of rows || []) {
      await db.run('DELETE FROM territory_graph_edges WHERE id = ?', row.id);
      removed += 1;
    }
  }
  return { edgesRemoved: removed };
}

async function countGraph(db, query) {
  await migrateTerritoryGraph(db);
  const nodes = await db.get('SELECT COUNT(*) as n FROM territory_graph_nodes WHERE territory_id = ?', query.territoryId);
  const edges = await db.get('SELECT COUNT(*) as n FROM territory_graph_edges WHERE territory_id = ?', query.territoryId);
  return { nodes: (nodes && nodes.n) || 0, edges: (edges && edges.n) || 0 };
}

module.exports = {
  nodeId,
  edgeId,
  upsertNode,
  upsertEdge,
  listNodes,
  listEdges,
  deleteFileSubgraph,
  deleteIncomingEdges,
  countGraph
};
