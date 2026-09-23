'use strict';

/**
 * Storage Backend Contract
 *
 * Defines the interface that any storage backend (SQLite, PostgreSQL, etc.)
 * must implement to be used by GenOS. This abstraction allows migrating from
 * SQLite to PostgreSQL without rewriting services.
 *
 * Contract methods (all async):
 *   - open(config)                    → Promise<void>
 *   - close()                         → Promise<void>
 *   - exec(sql, params?)              → Promise<void>           (DDL, pragmas)
 *   - run(sql, params?)               → Promise<{changes, lastID}>
 *   - get(sql, params?)                → Promise<row|null>
 *   - all(sql, params?)               → Promise<row[]>
 *   - withTransaction(fn)             → Promise<T>
 *   - withWriteRetry(fn, options?)    → Promise<T>
 *   - backupDatabaseFile(path)        → Promise<string|null>
 *   - isLockError(err)                → boolean
 */

class StorageBackend {
  constructor() {
    if (new.target === StorageBackend) {
      throw new Error('StorageBackend is abstract; use SQLiteBackend or PostgreSQLBackend');
    }
  }

  async open(_config) { throw new Error('Not implemented'); }
  async close() { throw new Error('Not implemented'); }
  async exec(_sql, _params) { throw new Error('Not implemented'); }
  async run(_sql, _params) { throw new Error('Not implemented'); }
  async get(_sql, _params) { throw new Error('Not implemented'); }
  async all(_sql, _params) { throw new Error('Not implemented'); }
  async withTransaction(_fn) { throw new Error('Not implemented'); }
  async withWriteRetry(_fn, _options) { throw new Error('Not implemented'); }
  async backupDatabaseFile(_path) { throw new Error('Not implemented'); }
  isLockError(_err) { throw new Error('Not implemented'); }
}

/**
 * SQLite backend — current production implementation.
 * Wraps the existing getDatabase/closeDatabase/withTransaction API.
 */
class SQLiteBackend extends StorageBackend {
  constructor() {
    super();
    this._db = null;
    this._dbFilePath = null;
  }

  async open(config) {
    const { getDatabase } = require('./index');
    this._db = await getDatabase(config.dbFilePath);
    this._dbFilePath = config.dbFilePath;
  }

  async close() {
    const { closeDatabase } = require('./index');
    await closeDatabase();
    this._db = null;
  }

  async exec(sql, params) {
    return this._db.exec(sql, params);
  }

  async run(sql, params) {
    return this._db.run(sql, params);
  }

  async get(sql, params) {
    return this._db.get(sql, params);
  }

  async all(sql, params) {
    return this._db.all(sql, params);
  }

  async withTransaction(fn) {
    const { withTransaction } = require('./index');
    return withTransaction(this._db, fn);
  }

  async withWriteRetry(fn, options) {
    const { withWriteRetry } = require('./index');
    return withWriteRetry(fn, options);
  }

  async backupDatabaseFile(path) {
    const { backupDatabaseFile } = require('./index');
    return backupDatabaseFile(path);
  }

  isLockError(err) {
    const { isLockError } = require('./index');
    return isLockError(err);
  }
}

/**
 * PostgreSQL backend — stub for future distributed deployments.
 * Not yet implemented; throws on open.
 */
class PostgreSQLBackend extends StorageBackend {
  async open(_config) {
    throw new Error('PostgreSQL backend not yet implemented. Use SQLiteBackend for now.');
  }
}

/**
 * Factory: returns the configured backend.
 * Environment variable GENOS_STORAGE_BACKEND selects the backend.
 * Default: 'sqlite'.
 */
function createStorageBackend(options = {}) {
  const backendName = options.backend || process.env.GENOS_STORAGE_BACKEND || 'sqlite';
  switch (backendName.toLowerCase()) {
    case 'sqlite':
      return new SQLiteBackend();
    case 'postgresql':
    case 'postgres':
      return new PostgreSQLBackend();
    default:
      throw new Error(`Unknown storage backend: ${backendName}`);
  }
}

module.exports = {
  StorageBackend,
  SQLiteBackend,
  PostgreSQLBackend,
  createStorageBackend,
};
