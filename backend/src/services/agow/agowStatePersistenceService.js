'use strict';

const { AdaptiveStateService } = require('../adaptiveStateService');

async function databaseFor(db) {
  if (db && typeof db.get === 'function') return db;
  return require('../../db').getDatabase();
}

async function load(options) {
  const db = await databaseFor(options.db);
  const store = new AdaptiveStateService(db);
  return { db, state: (await store.restoreObject(options.scope, options.agentId)) || options.fallback || {} };
}

async function save(options) {
  const db = await databaseFor(options.db);
  const store = new AdaptiveStateService(db);
  await store.persistObject(options.scope, options.agentId, options.state, options.version || 1);
  return options.state;
}

async function update(options, transform) {
  const db = await databaseFor(options.db);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const result = await attemptUpdate({ ...options, db }, transform);
      if (result) return result;
    } catch (error) {
      if (error.code !== 'SQLITE_BUSY') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
  }
  throw new Error('agow-state-contention-limit');
}

async function attemptUpdate(options, transform) {
  const row = await options.db.get('SELECT payload_json, version FROM adaptive_state WHERE scope = ? AND key = ?',
    options.scope, options.agentId);
  const version = Number(row?.version || 0);
  const state = transform(row ? JSON.parse(row.payload_json) : {});
  const write = await options.db.run(`INSERT OR REPLACE INTO adaptive_state
    (scope, key, payload_json, version, updated_at) SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP
    WHERE COALESCE((SELECT version FROM adaptive_state WHERE scope = ? AND key = ?), 0) = ?`,
  options.scope, options.agentId, JSON.stringify(state), version + 1, options.scope, options.agentId, version);
  return write.changes === 1 ? state : null;
}

module.exports = { databaseFor, load, save, update };
