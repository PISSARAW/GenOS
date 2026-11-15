'use strict';

const Database = require('better-sqlite3');

const OPEN_READONLY = 1;
const OPEN_READWRITE = 2;
const OPEN_CREATE = 4;

function databaseOptions(options) {
  const readonly = options.readonly === true || options.mode === OPEN_READONLY;
  const normalized = {
    readonly,
    fileMustExist: options.fileMustExist === true || readonly
  };
  if (options.timeout !== undefined) normalized.timeout = options.timeout;
  return normalized;
}

function normalizeRun(result) {
  return {
    changes: result.changes,
    lastID: result.lastInsertRowid,
    lastInsertRowid: result.lastInsertRowid
  };
}

class AsyncDatabase {
  constructor(raw) {
    this.db = raw;
  }

  async run(sql, ...parameters) {
    return normalizeRun(this.db.prepare(sql).run(...parameters));
  }

  async get(sql, ...parameters) {
    return this.db.prepare(sql).get(...parameters);
  }

  async all(sql, ...parameters) {
    return this.db.prepare(sql).all(...parameters);
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  async close() {
    this.db.close();
  }

  getDatabaseInstance() {
    return this.db;
  }
}

async function open(options = {}) {
  if (!options.filename) throw new TypeError('SQLite filename is required.');
  return new AsyncDatabase(new Database(options.filename, databaseOptions(options)));
}

function verbose() {
  return module.exports;
}

module.exports = { AsyncDatabase, Database, OPEN_CREATE, OPEN_READONLY, OPEN_READWRITE, open, verbose };
