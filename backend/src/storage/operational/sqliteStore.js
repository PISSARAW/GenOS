'use strict';

/**
 * SQLite Operational Store — source of truth for agents, missions, jobs, permissions, etc.
 */
class SQLiteStore {
  constructor() {
    this._db = null;
  }

  async init() {
    const { getDatabase } = require('../../db');
    this._db = await getDatabase();
  }

  get db() {
    return this._db;
  }

  async all(sql, params = []) {
    return this._db.all(sql, params);
  }

  async get(sql, params = []) {
    return this._db.get(sql, params);
  }

  async run(sql, params = []) {
    return this._db.run(sql, params);
  }

  async exec(sql) {
    return this._db.exec(sql);
  }

  async close() {
    const { closeDatabase } = require('../../db');
    await closeDatabase();
  }
}

module.exports = { SQLiteStore };
