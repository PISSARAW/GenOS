'use strict';

const { createStorageBackend } = require('../services/storageBackend');

/**
 * Repository base class — provides CRUD operations on a table.
 * Services should extend this class instead of calling db.all() directly.
 *
 * Usage:
 *   class AgentRepository extends Repository {
 *     constructor() { super('agents'); }
 *     async findById(id) { return this.get('SELECT * FROM agents WHERE id = ?', [id]); }
 *   }
 */
class Repository {
  constructor(tableName) {
    this.tableName = tableName;
  }

  async get(sql, params) {
    const backend = createStorageBackend();
    return backend.get(sql, params);
  }

  async all(sql, params) {
    const backend = createStorageBackend();
    return backend.all(sql, params);
  }

  async run(sql, params) {
    const backend = createStorageBackend();
    return backend.run(sql, params);
  }

  async exec(sql, params) {
    const backend = createStorageBackend();
    return backend.exec(sql, params);
  }

  async withTransaction(fn) {
    const backend = createStorageBackend();
    return backend.withTransaction(fn);
  }

  async withWriteRetry(fn, options) {
    const backend = createStorageBackend();
    return backend.withWriteRetry(fn, options);
  }

  async findById(id) {
    return this.get(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
  }

  async findAll(limit = 100, offset = 0) {
    return this.all(`SELECT * FROM ${this.tableName} LIMIT ? OFFSET ?`, [limit, offset]);
  }

  async insert(row) {
    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    return this.run(sql, keys.map((k) => row[k]));
  }

  async update(id, patch) {
    const keys = Object.keys(patch);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    return this.run(sql, [...keys.map((k) => patch[k]), id]);
  }

  async delete(id) {
    return this.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
  }

  async count() {
    const row = await this.get(`SELECT COUNT(*) AS count FROM ${this.tableName}`);
    return row ? row.count : 0;
  }
}

module.exports = { Repository };
