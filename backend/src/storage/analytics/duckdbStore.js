'use strict';

/**
 * DuckDB Analytics Store — OLAP, uplift, benchmarks, heavy telemetry.
 * Reads from SQLite source of truth via ATTACH or Parquet export.
 *
 * SQLite = canonical truth. DuckDB = rebuildable analytical projection.
 * All paths resolve through StoragePaths (.genos/data bundle).
 */

const path = require('path');

class DuckDBStore {
  constructor(options = {}) {
    this._db = null;
    this._available = false;
    this._dbPath = options.dbPath || null;
    this._sqlitePath = options.sqlitePath || null;
  }

  async init() {
    const { FILES, ensureDirs } = require('../storagePaths');
    ensureDirs();
    const dbPath = this._dbPath || FILES.duckdb;
    const duckdb = require('duckdb');
    this._db = new duckdb.Database(dbPath);
    this._available = true;
    try {
      await this.exec('INSTALL sqlite_scanner');
    } catch (_) {
      // Already installed or offline — continue, LOAD may still work.
    }
    try {
      await this.exec('LOAD sqlite_scanner');
    } catch (err) {
      console.warn('[DuckDBStore] sqlite_scanner unavailable:', err.message);
    }
    const sqlitePath = this._sqlitePath || process.env.GENOS_DB_PATH || path.resolve(__dirname, '../../../genos.db');
    try {
      await this.attachSqlite(sqlitePath, 'operational');
    } catch (err) {
      console.warn('[DuckDBStore] Could not attach SQLite:', err.message);
    }
    await this.ensureDatasets();
    return this;
  }

  get db() {
    return this._db;
  }

  get available() {
    return this._available && !!this._db;
  }

  async attachSqlite(sqlitePath, alias = 'operational') {
    if (!this._db) throw new Error('DuckDBStore not initialized');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error(`Invalid attach alias: ${alias}`);
    const escaped = String(sqlitePath).replace(/'/g, "''");
    try {
      await this.exec(`DETACH ${alias}`);
    } catch (_) {
      // Alias not attached yet — nothing to detach.
    }
    await this.exec(`ATTACH '${escaped}' AS ${alias} (TYPE SQLITE)`);
  }

  async ensureDatasets() {
    if (!this._db) return;
    await this.exec(`CREATE SCHEMA IF NOT EXISTS projection`);
    await this.exec(`CREATE TABLE IF NOT EXISTS projection.materialized_at (
      dataset TEXT PRIMARY KEY,
      materialized_at TEXT NOT NULL DEFAULT (CAST(now() AS VARCHAR)),
      row_count INTEGER NOT NULL DEFAULT 0,
      checksum TEXT
    )`);
  }

  /**
   * Materialize analytical datasets from the attached SQLite.
   * Returns per-dataset row counts. Missing source tables are skipped
   * (fresh DBs may not have every domain table yet).
   */
  async materialize(sqliteAlias = 'operational') {
    const datasets = ['agents', 'agent_relations', 'lineage_edges', 'telemetry_events'];
    const results = {};
    for (const table of datasets) {
      try {
        await this.exec(`CREATE OR REPLACE VIEW projection.${table} AS SELECT * FROM ${sqliteAlias}.main.${table}`);
        const rows = await this.all(`SELECT COUNT(*) AS count FROM projection.${table}`);
        const rawCount = rows && rows[0] ? rows[0].count : 0;
        const count = typeof rawCount === 'bigint' ? Number(rawCount) : (Number(rawCount) || 0);
        results[table] = count;
        await this.exec(
          `INSERT INTO projection.materialized_at (dataset, row_count) VALUES ('${table}', ${Number(count) || 0})
           ON CONFLICT (dataset) DO UPDATE SET materialized_at = CAST(now() AS VARCHAR), row_count = excluded.row_count`
        );
      } catch (_) {
        results[table] = null;
      }
    }
    return results;
  }

  async checksum() {
    try {
      const rows = await this.all('SELECT dataset, row_count FROM projection.materialized_at ORDER BY dataset');
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    } catch (_) {
      return null;
    }
  }

  async query(sql, params = []) {
    return this.all(sql, params);
  }

  async all(sql, params = []) {
    const db = this._db;
    if (!db) throw new Error('DuckDBStore not initialized');
    return new Promise((resolve, reject) => {
      const args = Array.isArray(params) ? params : [];
      const cb = (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      };
      if (args.length) db.all(sql, ...args, cb);
      else db.all(sql, cb);
    });
  }

  async exec(sql) {
    const db = this._db;
    if (!db) throw new Error('DuckDBStore not initialized');
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close() {
    if (this._db) {
      const db = this._db;
      this._db = null;
      this._available = false;
      await new Promise((resolve) => db.close(resolve));
    }
  }
}

// Backwards/forwards-compatible alias: registry, planner and CLI must
// agree on one export. Both names resolve to the same class.
const DuckDBAnalyticsStore = DuckDBStore;

module.exports = { DuckDBStore, DuckDBAnalyticsStore };
