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

module.exports = { databaseFor, load, save };
