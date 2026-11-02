'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

function messageKey(message) {
  return digest([message.scope, message.conversationId, message.sender, message.idempotencyKey]);
}

class HandoffStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS continuity_handoffs (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS continuity_handoff_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
        message TEXT NOT NULL, result TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS continuity_handoff_intents (
        transfer_id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL
      );`);
  }

  state(id) {
    const row = this.db.prepare('SELECT state FROM continuity_handoffs WHERE id = ?').get(id);
    return row ? JSON.parse(row.state) : null;
  }

  write(state) {
    this.db.prepare('INSERT OR REPLACE INTO continuity_handoffs (id,state) VALUES (?,?)')
      .run(state.transferId, JSON.stringify(state));
  }

  compare(expected, transferId) {
    if (digest(this.state(transferId)) !== digest(expected)) throw new Error('CONTINUITY handoff changed concurrently; retry.');
  }

  replay(message) {
    this.checkIntent(message);
    const rows = this.db.prepare(`SELECT fingerprint,result FROM continuity_handoff_events
      WHERE message_id = ? OR idempotency_key = ?`).all(message.messageId, messageKey(message));
    if (!rows.length) return null;
    if (rows.some((row) => row.fingerprint !== digest(message))) throw new Error('CONTINUITY idempotency conflict.');
    return JSON.parse(rows[0].result);
  }

  checkIntent(message) {
    const intents = this.db.prepare(`SELECT fingerprint FROM continuity_handoff_intents
      WHERE message_id = ? OR idempotency_key = ?`).all(message.messageId, messageKey(message));
    if (intents.some((row) => row.fingerprint !== digest(message))) throw new Error('CONTINUITY pending idempotency conflict.');
  }

  pending(change) {
    return this.db.transaction(() => {
      this.compare(change.expected, change.state.transferId);
      this.db.prepare(`INSERT INTO continuity_handoff_intents
        (transfer_id,message_id,idempotency_key,fingerprint) VALUES (?,?,?,?)`)
        .run(change.state.transferId, change.message.messageId, messageKey(change.message), digest(change.message));
      this.write(change.state);
      return structuredClone(change.state);
    }).immediate();
  }

  commit(change) {
    return this.db.transaction(() => {
      const replay = this.replay(change.message);
      if (replay) return replay;
      this.compare(change.expected, change.state.transferId);
      this.write(change.state);
      this.db.prepare(`INSERT INTO continuity_handoff_events
        (message_id,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`)
        .run(change.message.messageId, messageKey(change.message), digest(change.message),
          JSON.stringify(change.message), JSON.stringify(change.result));
      return change.result;
    }).immediate();
  }

  history() {
    return this.db.prepare('SELECT * FROM continuity_handoff_events ORDER BY sequence').all()
      .map((row) => ({ sequence: row.sequence, message: JSON.parse(row.message), result: JSON.parse(row.result) }));
  }

  close() { this.db.close(); }
}

module.exports = { HandoffStore };
