'use strict';

/**
 * Graph Repository — interface for graph storage backends.
 *
 * Implementations:
 *   - LadybugGraphRepository (primary, when @ladybugdb/core is available)
 *   - SQLiteGraphRepository (fallback, bounded CTE traversal)
 *
 * Authority: SQLite is canonical. Graph store is a rebuildable projection.
 */

class GraphRepository {
  async upsertNode(_node) { throw new Error('Not implemented'); }
  async upsertEdge(_edge) { throw new Error('Not implemented'); }
  async neighbors(_query) { throw new Error('Not implemented'); }
  async traverse(_query) { throw new Error('Not implemented'); }
  async shortestPath(_query) { throw new Error('Not implemented'); }
  async executeReadQuery(_query) { throw new Error('Not implemented'); }
}

/**
 * SQLite Graph Repository — fallback using bounded recursive CTEs.
 * Used when LadybugDB is unavailable or for simple traversals.
 */
class SQLiteGraphRepository extends GraphRepository {
  constructor(db) {
    super();
    this._db = db;
  }

  async upsertNode(node) {
    const { id, label, properties } = node;
    const props = JSON.stringify(properties || {});
    await this._db.run(
      `INSERT INTO graph_nodes (id, label, properties_json, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label, properties_json = excluded.properties_json, updated_at = CURRENT_TIMESTAMP`,
      [id, label, props]
    );
  }

  async upsertEdge(edge) {
    const { id, source, target, label, properties } = edge;
    const props = JSON.stringify(properties || {});
    await this._db.run(
      `INSERT INTO graph_edges (id, source_id, target_id, label, properties_json, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET source_id = excluded.source_id, target_id = excluded.target_id, label = excluded.label, properties_json = excluded.properties_json, updated_at = CURRENT_TIMESTAMP`,
      [id, source, target, label, props]
    );
  }

  async neighbors(query) {
    const { nodeId, direction = 'both', limit = 50 } = query;
    if (direction === 'out') {
      return this._db.all(
        `SELECT e.target_id AS node_id, e.label, e.properties_json FROM graph_edges e WHERE e.source_id = ? LIMIT ?`,
        [nodeId, limit]
      );
    }
    if (direction === 'in') {
      return this._db.all(
        `SELECT e.source_id AS node_id, e.label, e.properties_json FROM graph_edges e WHERE e.target_id = ? LIMIT ?`,
        [nodeId, limit]
      );
    }
    return this._db.all(
      `SELECT e.target_id AS node_id, e.label, e.properties_json FROM graph_edges e WHERE e.source_id = ?
       UNION ALL
       SELECT e.source_id AS node_id, e.label, e.properties_json FROM graph_edges e WHERE e.target_id = ?
       LIMIT ?`,
      [nodeId, nodeId, limit]
    );
  }

  async traverse(query) {
    const { startId, maxDepth = 4, direction = 'both' } = query;
    const dirClause = direction === 'out' ? 'e.source_id = n.id' : direction === 'in' ? 'e.target_id = n.id' : '(e.source_id = n.id OR e.target_id = n.id)';
    const rows = await this._db.all(
      `WITH RECURSIVE traverse(node_id, depth, path) AS (
        SELECT ?, 0, ?
        UNION ALL
        SELECT CASE WHEN e.source_id = t.node_id THEN e.target_id ELSE e.source_id END,
               t.depth + 1,
               t.path || ',' || CASE WHEN e.source_id = t.node_id THEN e.target_id ELSE e.source_id END
        FROM traverse t
        JOIN graph_edges e ON ${dirClause}
        WHERE t.depth < ? AND instr(t.path || ',' || CASE WHEN e.source_id = t.node_id THEN e.target_id ELSE e.source_id END, ',' || CASE WHEN e.source_id = t.node_id THEN e.target_id ELSE e.source_id END || ',') = 0
      )
      SELECT node_id, depth, path FROM traverse WHERE depth > 0 ORDER BY depth, node_id`,
      [startId, startId, maxDepth]
    );
    return { nodes: rows.map((r) => ({ id: r.node_id, depth: r.depth, path: r.path })) };
  }

  async shortestPath(query) {
    const { sourceId, targetId, maxDepth = 6 } = query;
    const rows = await this._db.all(
      `WITH RECURSIVE paths(node_id, depth, path) AS (
        SELECT ?, 0, ?
        UNION ALL
        SELECT CASE WHEN e.source_id = p.node_id THEN e.target_id ELSE e.source_id END,
               p.depth + 1,
               p.path || ',' || CASE WHEN e.source_id = p.node_id THEN e.target_id ELSE e.source_id END
        FROM paths p
        JOIN graph_edges e ON (e.source_id = p.node_id OR e.target_id = p.node_id)
        WHERE p.depth < ? AND instr(p.path || ',' || CASE WHEN e.source_id = p.node_id THEN e.target_id ELSE e.source_id END, ',' || CASE WHEN e.source_id = p.node_id THEN e.target_id ELSE e.source_id END || ',') = 0
      )
      SELECT node_id, depth, path FROM paths WHERE node_id = ? ORDER BY depth LIMIT 1`,
      [sourceId, sourceId, maxDepth, targetId]
    );
    if (!rows.length) return null;
    return { path: rows[0].path, depth: rows[0].depth };
  }

  async executeReadQuery(query) {
    // Fallback: only supports simple neighbor queries
    if (query.type === 'neighbors') {
      return this.neighbors(query);
    }
    throw new Error(`SQLite graph fallback does not support query type: ${query.type}`);
  }
}

/**
 * Ladybug Graph Repository — primary graph backend.
 * Uses @ladybugdb/core when available.
 */
class LadybugGraphRepository extends GraphRepository {
  constructor(db) {
    super();
    this._db = db;
    this._lbug = null;
    this._available = false;
    this._init();
  }

  async _init() {
    try {
      this._lbug = require('@ladybugdb/core');
      this._available = true;
    } catch (_) {
      this._available = false;
    }
  }

  get available() {
    return this._available;
  }

  async upsertNode(node) {
    if (!this._available) throw new Error('LadybugDB not available');
    // LadybugDB upsert via Cypher
    const { id, label, properties } = node;
    const props = JSON.stringify(properties || {});
    await this._lbug.execute(`MERGE (n:${label} {id: '${id}'}) SET n.properties = '${props}'`);
  }

  async upsertEdge(edge) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { id, source, target, label, properties } = edge;
    const props = JSON.stringify(properties || {});
    await this._lbug.execute(`MATCH (s {id: '${source}'}), (t {id: '${target}'}) MERGE (s)-[r:${label} {id: '${id}'}]->(t) SET r.properties = '${props}'`);
  }

  async neighbors(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { nodeId, direction = 'both', limit = 50 } = query;
    const rel = direction === 'out' ? '-' : direction === 'in' ? '-' : '-';
    const arrow = direction === 'out' ? '->' : direction === 'in' ? '<-' : '-';
    const rows = await this._lbug.execute(`MATCH (n {id: '${nodeId}'})-${rel}[r]${arrow}(m) RETURN m.id AS node_id, type(r) AS label, r.properties AS properties LIMIT ${limit}`);
    return rows;
  }

  async traverse(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { startId, maxDepth = 4 } = query;
    const rows = await this._lbug.execute(`MATCH p = (start {id: '${startId}'})-[*1..${maxDepth}]-(end) RETURN nodes(p) AS nodes, relationships(p) AS edges`);
    return rows;
  }

  async shortestPath(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { sourceId, targetId } = query;
    const rows = await this._lbug.execute(`MATCH p = shortestPath((s {id: '${sourceId}'})-[*]-(t {id: '${targetId}'})) RETURN p`);
    return rows.length ? { path: rows[0] } : null;
  }

  async executeReadQuery(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    return this._lbug.execute(query.cypher);
  }
}

/**
 * Graph Repository Factory — returns Ladybug if available, SQLite fallback otherwise.
 */
function createGraphRepository(db) {
  const ladybug = new LadybugGraphRepository(db);
  if (ladybug.available) return ladybug;
  return new SQLiteGraphRepository(db);
}

module.exports = {
  GraphRepository,
  SQLiteGraphRepository,
  LadybugGraphRepository,
  createGraphRepository,
};
