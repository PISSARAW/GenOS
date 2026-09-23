'use strict';

/**
 * LanceDB Vector Repository — optional semantic search backend.
 *
 * Authority: sqlite-vec is canonical for current scale.
 * LanceDB is a promoted projection when benchmarks prove it necessary.
 *
 * Rule: UDF = deterministic math; service = policy.
 * This store only handles vector storage and similarity search.
 */

const lancedb = require('@lancedb/lancedb');

class LanceVectorRepository {
  constructor(dbPath = './genos.lance') {
    this._dbPath = dbPath;
    this._db = null;
    this._available = false;
  }

  async init() {
    try {
      this._db = await lancedb.connect(this._dbPath);
      this._available = true;
    } catch (error) {
      this._available = false;
    }
    return this;
  }

  get available() {
    return this._available;
  }

  async createTable(tableName, schema) {
    if (!this._available) throw new Error('LanceDB not available');
    this._table = await this._db.createTable(tableName, schema);
    return this._table;
  }

  async upsert(tableName, data) {
    if (!this._available) throw new Error('LanceDB not available');
    const table = await this._db.openTable(tableName);
    await table.add(data);
  }

  async search(tableName, vector, limit = 10) {
    if (!this._available) throw new Error('LanceDB not available');
    const table = await this._db.openTable(tableName);
    return table.search(vector).limit(limit).toArray();
  }

  async dropTable(tableName) {
    if (!this._available) throw new Error('LanceDB not available');
    await this._db.dropTable(tableName);
  }
}

module.exports = { LanceVectorRepository };
