'use strict';

const nativeDb = require('../../db');
const { materialize } = require('./deltaState.cjs');
const wrapped = new WeakMap();
const adapters = new WeakSet();

function wrap(db) {
  if (adapters.has(db)) return db;
  if (wrapped.has(db)) return wrapped.get(db);
  const adapter = new Proxy(db, {
    get(target, property) {
      if (property === 'get') return async (...args) => hydrate(target, await target.get(...args));
      if (property === 'all') return async (...args) => Promise.all((await target.all(...args)).map((row) => hydrate(target, row)));
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  wrapped.set(db, adapter);
  adapters.add(adapter);
  return adapter;
}

async function hydrate(db, row) {
  if (!row || typeof row.state_json !== 'string' || !row.state_json.startsWith('{"$genosAgentGitStorage":')) return row;
  return { ...row, state_json: await materialize(db, row.state_json) };
}

async function getDatabase() {
  return wrap(await nativeDb.getDatabase());
}

module.exports = { ...nativeDb, getDatabase, wrap };
