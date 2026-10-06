'use strict';
const sqlite3 = require('sqlite3');
const { promisify } = require('node:util');

function openDatabase(filename = ':memory:') {
  const raw = new sqlite3.Database(filename);
  return {
    exec: sql => promisify(raw.exec.bind(raw))(sql),
    get: (sql, ...params) => promisify(raw.get.bind(raw))(sql, ...flatten(params)),
    all: (sql, ...params) => promisify(raw.all.bind(raw))(sql, ...flatten(params)),
    run(sql, ...params) {
      return new Promise((resolve, reject) => raw.run(sql, flatten(params), function done(error) {
        if (error) return reject(error);
        resolve({ changes: this.changes, lastID: this.lastID });
      }));
    },
    close: () => promisify(raw.close.bind(raw))()
  };
}

function flatten(params) {
  return params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
}

async function authoritySchema(db) {
  await db.exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, description TEXT);
    CREATE TABLE homeostasis_states (id TEXT PRIMARY KEY, contract_id TEXT, mission_id TEXT,
      status TEXT, state_json TEXT, observed_at TEXT);
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT, status TEXT);`);
}

module.exports = { openDatabase, authoritySchema };
