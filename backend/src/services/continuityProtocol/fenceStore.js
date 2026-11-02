'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');
const { contextKey } = require('./fenceValidation');

function operationKey(action, request) {
  return digest([contextKey(request), action, request.transferId || request.operationId]);
}

class FenceStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS continuity_resource_authorities (
        context_id TEXT PRIMARY KEY, authority TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS continuity_resource_operations (
        operation_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, receipt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS continuity_resource_values (
        context_id TEXT NOT NULL, resource_id TEXT NOT NULL, item_key TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY (context_id,resource_id,item_key)
      );
      CREATE TABLE IF NOT EXISTS continuity_resource_effects (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, context_id TEXT NOT NULL, effect TEXT NOT NULL
      );
    `);
  }

  authority(context) {
    const row = this.db.prepare('SELECT authority FROM continuity_resource_authorities WHERE context_id=?').get(contextKey(context));
    return row ? JSON.parse(row.authority) : null;
  }

  saveAuthority(context, authority) {
    this.db.prepare('INSERT OR REPLACE INTO continuity_resource_authorities(context_id,authority) VALUES (?,?)')
      .run(contextKey(context), JSON.stringify(authority));
  }

  replay(action, request) {
    const row = this.db.prepare('SELECT fingerprint,receipt FROM continuity_resource_operations WHERE operation_key=?')
      .get(operationKey(action, request));
    if (!row) return null;
    if (row.fingerprint !== digest(request)) throw new Error('CONTINUITY operation idempotency conflict.');
    return JSON.parse(row.receipt);
  }

  record(action, request, receipt) {
    this.db.prepare('INSERT INTO continuity_resource_operations(operation_key,fingerprint,receipt) VALUES (?,?,?)')
      .run(operationKey(action, request), digest(request), JSON.stringify(receipt));
  }

  write(request) {
    const context = contextKey(request);
    this.db.prepare('INSERT OR REPLACE INTO continuity_resource_values(context_id,resource_id,item_key,value) VALUES (?,?,?,?)')
      .run(context, request.resourceId, request.key, JSON.stringify(request.value));
    this.db.prepare('INSERT INTO continuity_resource_effects(context_id,effect) VALUES (?,?)')
      .run(context, JSON.stringify(request));
  }

  effects(context) {
    return this.db.prepare('SELECT sequence,effect FROM continuity_resource_effects WHERE context_id=? ORDER BY sequence')
      .all(contextKey(context)).map(row => ({ sequence: row.sequence, ...JSON.parse(row.effect) }));
  }

  value(context, item) {
    const row = this.db.prepare('SELECT value FROM continuity_resource_values WHERE context_id=? AND resource_id=? AND item_key=?')
      .get(contextKey(context), item.resourceId, item.key);
    return row ? JSON.parse(row.value) : null;
  }

  atomic(callback) { return this.db.transaction(callback).immediate(); }
  close() { this.db.close(); }
}

module.exports = { FenceStore };
