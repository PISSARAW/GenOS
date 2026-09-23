'use strict';

/**
 * DuckDB Analytics Store — OLAP cortex for GenOS.
 *
 * Authority: SQLite is canonical. DuckDB is a rebuildable analytical projection.
 * DuckDB can directly ATTACH a SQLite database.
 *
 * Usage:
 *   const store = new DuckDBAnalyticsStore();
 *   await store.init();
 *   await store.attachSqlite('./genos.db', 'operational');
 *   const stats = await store.query('SELECT * FROM operational.telemetry_events LIMIT 10');
 */

const duckdb = require('duckdb');

class DuckDBAnalyticsStore {
  constructor(dbPath = ':memory:') {
    this._dbPath = dbPath;
    this._db = null;
    this._available = false;
  }

  async init() {
    try {
      this._db = new duckdb.Database(this._dbPath);
      this._available = true;
    } catch (error) {
      this._available = false;
    }
    return this;
  }

  get available() {
    return this._available;
  }

  async attachSqlite(sqlitePath, alias = 'operational') {
    if (!this._available) throw new Error('DuckDB not available');
    return new Promise((resolve, reject) => {
      this._db.all(`ATTACH '${sqlitePath}' AS ${alias} (TYPE SQLITE)`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async query(sql) {
    if (!this._available) throw new Error('DuckDB not available');
    return new Promise((resolve, reject) => {
      this._db.all(sql, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async createTable(tableName, sql) {
    if (!this._available) throw new Error('DuckDB not available');
    return new Promise((resolve, reject) => {
      this._db.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

module.exports = { DuckDBAnalyticsStore };
