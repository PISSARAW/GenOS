'use strict';

/**
 * Deferred database reference to break circular dependency.
 * Services requiring db should import from this module and call getDb().
 */

let _db = null;
let _ready = false;
const _waiters = [];

function setDb(db) {
  _db = db;
  _ready = true;
  while (_waiters.length) _waiters.shift()(db);
}

async function getDb() {
  if (_ready) return _db;
  return new Promise(resolve => _waiters.push(resolve));
}

module.exports = { setDb, getDb };
