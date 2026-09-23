'use strict';

/**
 * LadybugGraphRepository — primary graph backend using @ladybugdb/core.
 *
 * Authority: SQLite is canonical. Ladybug is a rebuildable projection.
 * This repository is idempotent: replaying an event produces the same graph.
 */

const { Database, Connection } = require('@ladybugdb/core');

class LadybugGraphRepository {
  constructor(dbPath = './genos.db') {
    this._dbPath = dbPath;
    this._db = null;
    this._conn = null;
    this._available = false;
  }

  async init() {
    try {
      this._db = new Database(this._dbPath);
      this._conn = new Connection(this._db);
      this._available = true;
    } catch (error) {
      this._available = false;
    }
    return this;
  }

  get available() {
    return this._available;
  }

  async ensureSchema() {
    if (!this._available) return;
    // LadybugDB: create node tables (idempotent)
    const tables = ['Agent', 'Genome', 'Mission', 'Claim', 'Evidence', 'Finding', 'Daemon', 'Territory', 'Commit', 'Snapshot', 'Phenotype', 'Capability', 'Memory', 'Concept', 'Experiment', 'Tool'];
    for (const table of tables) {
      try {
        await this._conn.query(`CREATE NODE TABLE IF NOT EXISTS ${table}(id STRING, PRIMARY KEY(id))`);
      } catch (_) {
        // Table may already exist
      }
    }
  }

  async upsertNode(node) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { id, label, properties } = node;
    const props = JSON.stringify(properties || {});
    await this._conn.query(`MERGE (n:${label} {id: '${id}'}) SET n += ${props}`);
  }

  async upsertEdge(edge) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { id, source, target, label, properties } = edge;
    const props = JSON.stringify(properties || {});
    await this._conn.query(`MATCH (s {id: '${source}'}), (t {id: '${target}'}) MERGE (s)-[r:${label} {id: '${id}'}]->(t) SET r += ${props}`);
  }

  async neighbors(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { nodeId, direction = 'both', limit = 50 } = query;
    const arrow = direction === 'out' ? '->' : direction === 'in' ? '<-' : '-';
    const result = await this._conn.query(`MATCH (n {id: '${nodeId}'})${arrow}[r]${arrow}(m) RETURN m.id AS node_id, type(r) AS label LIMIT ${limit}`);
    return result;
  }

  async traverse(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { startId, maxDepth = 4 } = query;
    const result = await this._conn.query(`MATCH p = (start {id: '${startId}'})-[*1..${maxDepth}]-(end) RETURN nodes(p) AS nodes, relationships(p) AS edges`);
    return result;
  }

  async shortestPath(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    const { sourceId, targetId } = query;
    const result = await this._conn.query(`MATCH p = shortestPath((s {id: '${sourceId}'})-[*]-(t {id: '${targetId}'})) RETURN p`);
    return result;
  }

  async executeReadQuery(query) {
    if (!this._available) throw new Error('LadybugDB not available');
    return this._conn.query(query.cypher);
  }

  async close() {
    if (this._db) {
      this._db.close();
      this._db = null;
      this._conn = null;
    }
  }
}

module.exports = { LadybugGraphRepository };
