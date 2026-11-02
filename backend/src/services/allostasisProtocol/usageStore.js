'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const v = require('./usageBindings');

const allocationKey = query => digest(query);
const operationKey = (query, operationId) => digest([query, operationId]);
const messageKey = (message, field) => digest([message.scope, message.missionId, message.conversationId,
  message.sender, message.audience, message[field]]);

class UsageStore {
  constructor(db) {
    this.db = db;
  }

  initialize() {
    return this.db.exec(`CREATE TABLE IF NOT EXISTS allostasis_usage_operations (
      operation_key TEXT PRIMARY KEY, allocation_key TEXT NOT NULL, body_json TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS allostasis_usage_messages (
      message_key TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS allostasis_usage_releases (
      release_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS allostasis_usage_observations (
      receipt_key TEXT PRIMARY KEY, allocation_key TEXT NOT NULL, operation_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, body_json TEXT NOT NULL
    ); CREATE TRIGGER IF NOT EXISTS allostasis_usage_observations_immutable
      BEFORE UPDATE ON allostasis_usage_observations
      BEGIN SELECT RAISE(ABORT,'Allostasis usage observations are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS allostasis_usage_observations_no_delete
      BEFORE DELETE ON allostasis_usage_observations
      BEGIN SELECT RAISE(ABORT,'Allostasis usage observations are append-only'); END;`);
  }

  async operation(query, operationId) {
    const row = await this.db.get('SELECT body_json FROM allostasis_usage_operations WHERE operation_key = ?', operationKey(query, operationId));
    return row ? JSON.parse(row.body_json) : null;
  }

  async operations(query) {
    const rows = await this.db.all('SELECT body_json FROM allostasis_usage_operations WHERE allocation_key = ?', allocationKey(query));
    return rows.map(row => JSON.parse(row.body_json));
  }

  async writeOperation(operation) {
    await this.db.run('INSERT OR REPLACE INTO allostasis_usage_operations VALUES (?,?,?)',
      operationKey(operation.query, operation.operationId), allocationKey(operation.query), JSON.stringify(operation));
  }

  async replay(message) {
    const rows = await this.db.all('SELECT fingerprint,result_json FROM allostasis_usage_messages WHERE message_key = ? OR idempotency_key = ?',
      messageKey(message, 'messageId'), messageKey(message, 'idempotencyKey'));
    if (rows.some(row => row.fingerprint !== digest(message))) throw new Error('ALLOSTASIS usage message idempotency conflict.');
    return rows.length ? JSON.parse(rows[0].result_json) : null;
  }

  async record(message, result) {
    await this.db.run('INSERT INTO allostasis_usage_messages VALUES (?,?,?,?)', messageKey(message, 'messageId'),
      messageKey(message, 'idempotencyKey'), digest(message), JSON.stringify(result));
  }

  async release(query, releaseId) {
    return this.db.get('SELECT fingerprint,result_json FROM allostasis_usage_releases WHERE release_key = ?', digest([query, releaseId]));
  }

  async recordRelease(input) {
    await this.db.run('INSERT INTO allostasis_usage_releases VALUES (?,?,?)', digest([input.query, input.releaseId]),
      digest(input.payload), JSON.stringify(input.result));
  }

  async observation(query, receiptId) {
    const row = await this.db.get('SELECT body_json FROM allostasis_usage_observations WHERE receipt_key = ?', digest([query, receiptId]));
    return row ? JSON.parse(row.body_json) : null;
  }

  async observe(input) {
    const prior = await this.observation(input.query, input.receiptId);
    if (prior) {
      if (!v.same(prior, input)) throw new Error('ALLOSTASIS usage receipt idempotency conflict.');
      return prior;
    }
    await this.db.run('INSERT INTO allostasis_usage_observations VALUES (?,?,?,?,?)',
      digest([input.query, input.receiptId]), allocationKey(input.query), input.operationId, digest(input), JSON.stringify(input));
    return input;
  }

  async history(query) {
    const rows = await this.db.all('SELECT body_json FROM allostasis_usage_observations WHERE allocation_key = ? ORDER BY rowid', allocationKey(query));
    return rows.map(row => JSON.parse(row.body_json));
  }
}

module.exports = { UsageStore };
