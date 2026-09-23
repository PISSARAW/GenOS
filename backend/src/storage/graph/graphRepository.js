'use strict';

/**
 * Graph Repository — interface for graph storage backends.
 *
 * Implementations:
 *   - LadybugStore (primary, when @ladybugdb/core is available)
 *   - SQLiteGraphRepository (fallback, bounded CTE traversal on canonical tables)
 *
 * Authority: SQLite is canonical. Graph store is a rebuildable projection.
 */

class GraphRepository {
  async upsertNode(_node) { throw new Error('Not implemented'); }
  async upsertEdge(_edge) { throw new Error('Not implemented'); }
  async deleteNode(_id) { throw new Error('Not implemented'); }
  async deleteEdge(_id) { throw new Error('Not implemented'); }
  async neighbors(_query) { throw new Error('Not implemented'); }
  async traverse(_query) { throw new Error('Not implemented'); }
  async shortestPath(_query) { throw new Error('Not implemented'); }
  async executeReadQuery(_query) { throw new Error('Not implemented'); }
}

/**
 * SQLite Graph Repository — fallback using bounded recursive CTEs.
 * Works directly on canonical tables (agent_relations, lineage_edges, memory_synapses).
 */
class SQLiteGraphRepository extends GraphRepository {
  constructor(db) {
    super();
    this._db = db;
  }

  async upsertNode(node) {
    // Nodes are stored in canonical tables (agents, etc.)
    // This is a no-op for the fallback — nodes are already in SQLite
  }

  async upsertEdge(edge) {
    const { id, source, target, label, properties } = edge;
    const props = JSON.stringify(properties || {});
    if (label === 'DESCENDS_FROM') {
      await this._db.run(
        `INSERT INTO lineage_edges (id, source_node_id, target_node_id, edge_type, metadata)
         VALUES (?, ?, ?, 'descends_from', ?)
         ON CONFLICT(id) DO UPDATE SET source_node_id = excluded.source_node_id, target_node_id = excluded.target_node_id`,
        [id, source, target, props]
      );
    } else {
      await this._db.run(
        `INSERT INTO agent_relations (id, source_agent_id, target_agent_id, relation_type, provenance_hash)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET source_agent_id = excluded.source_agent_id, target_agent_id = excluded.target_agent_id, relation_type = excluded.relation_type`,
        [id, source, target, label, props]
      );
    }
  }

  async deleteNode(id) {
    await this._db.run('DELETE FROM agents WHERE id = ?', [id]);
  }

  async deleteEdge(id) {
    await this._db.run('DELETE FROM agent_relations WHERE id = ?', [id]);
    await this._db.run('DELETE FROM lineage_edges WHERE id = ?', [id]);
  }

  async neighbors(query) {
    const { nodeId, direction = 'both', limit = 50 } = query;
    if (direction === 'out') {
      return this._db.all(
        `SELECT target_agent_id AS node_id, relation_type AS label FROM agent_relations WHERE source_agent_id = ? LIMIT ?`,
        [nodeId, limit]
      );
    }
    if (direction === 'in') {
      return this._db.all(
        `SELECT source_agent_id AS node_id, relation_type AS label FROM agent_relations WHERE target_agent_id = ? LIMIT ?`,
        [nodeId, limit]
      );
    }
    return this._db.all(
      `SELECT target_agent_id AS node_id, relation_type AS label FROM agent_relations WHERE source_agent_id = ?
       UNION ALL
       SELECT source_agent_id AS node_id, relation_type AS label FROM agent_relations WHERE target_agent_id = ?
       LIMIT ?`,
      [nodeId, nodeId, limit]
    );
  }

  async traverse(query) {
    const { startId, maxDepth = 4 } = query;
    const rows = await this._db.all(
      `WITH RECURSIVE traverse(node_id, depth, path) AS (
        SELECT ?, 0, ?
        UNION ALL
        SELECT CASE WHEN r.source_agent_id = t.node_id THEN r.target_agent_id ELSE r.source_agent_id END,
               t.depth + 1,
               t.path || ',' || CASE WHEN r.source_agent_id = t.node_id THEN r.target_agent_id ELSE r.source_agent_id END
        FROM traverse t
        JOIN agent_relations r ON (r.source_agent_id = t.node_id OR r.target_agent_id = t.node_id)
        WHERE t.depth < ? AND instr(t.path || ',' || CASE WHEN r.source_agent_id = t.node_id THEN r.target_agent_id ELSE r.source_agent_id END, ',' || CASE WHEN r.source_agent_id = t.node_id THEN r.target_agent_id ELSE r.source_agent_id END || ',') = 0
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
        SELECT CASE WHEN r.source_agent_id = p.node_id THEN r.target_agent_id ELSE r.source_agent_id END,
               p.depth + 1,
               p.path || ',' || CASE WHEN r.source_agent_id = p.node_id THEN r.target_agent_id ELSE r.source_agent_id END
        FROM paths p
        JOIN agent_relations r ON (r.source_agent_id = p.node_id OR r.target_agent_id = p.node_id)
        WHERE p.depth < ? AND instr(p.path || ',' || CASE WHEN r.source_agent_id = p.node_id THEN r.target_agent_id ELSE r.source_agent_id END, ',' || CASE WHEN r.source_agent_id = p.node_id THEN r.target_agent_id ELSE r.source_agent_id END || ',') = 0
      )
      SELECT node_id, depth, path FROM paths WHERE node_id = ? ORDER BY depth LIMIT 1`,
      [sourceId, sourceId, maxDepth, targetId]
    );
    if (!rows.length) return null;
    return { path: rows[0].path, depth: rows[0].depth };
  }

  async executeReadQuery(query) {
    if (query.type === 'neighbors') {
      return this.neighbors(query);
    }
    throw new Error(`SQLite graph fallback does not support query type: ${query.type}`);
  }
}

/**
 * Graph Repository Factory — returns LadybugStore if available, SQLite fallback otherwise.
 */
function createGraphRepository(db) {
  try {
    const { LadybugStore } = require('./ladybugStore');
    const store = new LadybugStore();
    // LadybugStore.init() is async, but we can check if the module loads
    // The actual availability check happens in capabilityRegistry
    return store;
  } catch (_) {
    return new SQLiteGraphRepository(db);
  }
}

module.exports = {
  GraphRepository,
  SQLiteGraphRepository,
  createGraphRepository,
};
