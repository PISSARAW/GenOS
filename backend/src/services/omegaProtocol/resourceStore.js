'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

class ResourceStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = FULL'); this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS omega_resource_authority (scope_id TEXT PRIMARY KEY, authority TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS omega_resource_values (scope_id TEXT NOT NULL, resource_id TEXT NOT NULL, action TEXT NOT NULL,
        value TEXT NOT NULL, PRIMARY KEY(scope_id,resource_id,action));
      CREATE TABLE IF NOT EXISTS omega_resource_effects (effect_key TEXT PRIMARY KEY, request_digest TEXT NOT NULL,
        scope_id TEXT NOT NULL, request TEXT NOT NULL, receipt TEXT NOT NULL);`);
  }

  authority(scope) {
    const row = this.db.prepare('SELECT authority FROM omega_resource_authority WHERE scope_id=?').get(digest(scope));
    return row ? JSON.parse(row.authority) : null;
  }

  save(scope, authority) {
    this.db.prepare('INSERT OR REPLACE INTO omega_resource_authority(scope_id,authority) VALUES (?,?)').run(digest(scope), JSON.stringify(authority));
  }

  receipt(request) {
    const row = this.db.prepare('SELECT request_digest,receipt FROM omega_resource_effects WHERE effect_key=?').get(request.effectKey);
    if (!row) return null;
    if (row.request_digest !== digest(request)) throw new Error('OMEGA receiver effect key conflict.');
    return JSON.parse(row.receipt);
  }

  write(request, receipt) {
    this.db.prepare('INSERT OR REPLACE INTO omega_resource_values(scope_id,resource_id,action,value) VALUES (?,?,?,?)')
      .run(digest(request.scope), request.resourceId, request.action, JSON.stringify(request.candidate));
    this.db.prepare('INSERT INTO omega_resource_effects(effect_key,request_digest,scope_id,request,receipt) VALUES (?,?,?,?,?)')
      .run(request.effectKey, digest(request), digest(request.scope), JSON.stringify(request), JSON.stringify(receipt));
  }

  effects(scope) {
    return this.db.prepare('SELECT request,receipt FROM omega_resource_effects WHERE scope_id=? ORDER BY rowid').all(digest(scope))
      .map(row => ({ request: JSON.parse(row.request), receipt: JSON.parse(row.receipt) }));
  }

  value(query) {
    const row = this.db.prepare('SELECT value FROM omega_resource_values WHERE scope_id=? AND resource_id=? AND action=?')
      .get(digest(query.scope), query.resourceId, query.action);
    return row ? JSON.parse(row.value) : null;
  }

  atomic(callback) { return this.db.transaction(callback).immediate(); }
  close() { this.db.close(); }
}

module.exports = { ResourceStore };
