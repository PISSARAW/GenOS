'use strict';

/**
 * LadybugDB Graph Store — graph traversal, lineage, provenance, social graph.
 * Projection from SQLite source of truth.
 */
class LadybugStore {
  constructor() {
    this._db = null;
  }

  async init() {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../../.genos/data/graph');
    fs.mkdirSync(dir, { recursive: true });
    const ladybug = require('@ladybugdb/core');
    this._db = new ladybug.Database(path.join(dir, 'world.lbdb'));
    await this._db.init();
    const conn = new ladybug.Connection(this._db);
    await conn.init();
    this._conn = conn;
  }

  get db() {
    return this._db;
  }

  get available() {
    return this._conn !== null;
  }

  async upsertNode(node) {
    const { id, label, properties } = node;
    const props = JSON.stringify(properties || {});
    await this._conn.query(`MERGE (n:${label} {id: '${id}'}) SET n += ${props}`);
  }

  async upsertEdge(edge) {
    const { id, source, target, label, properties } = edge;
    const props = JSON.stringify(properties || {});
    await this._conn.query(`MATCH (s {id: '${source}'}), (t {id: '${target}'}) MERGE (s)-[r:${label} {id: '${id}'}]->(t) SET r += ${props}`);
  }

  async neighbors(query) {
    const { nodeId, direction = 'both', limit = 50 } = query;
    const arrow = direction === 'out' ? '->' : direction === 'in' ? '<-' : '-';
    return this._conn.query(`MATCH (n {id: '${nodeId}'})${arrow}[r]${arrow}(m) RETURN m.id AS node_id, type(r) AS label LIMIT ${limit}`);
  }

  async traverse(query) {
    const { startId, maxDepth = 4 } = query;
    return this._conn.query(`MATCH p = (start {id: '${startId}'})-[*1..${maxDepth}]-(end) RETURN nodes(p) AS nodes, relationships(p) AS edges`);
  }

  async executeQuery(cypher) {
    return this._conn.query(cypher);
  }

  async close() {
    if (this._db) await this._db.close();
  }
}

module.exports = { LadybugStore };
