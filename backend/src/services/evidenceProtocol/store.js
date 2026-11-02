'use strict';

const Database = require('better-sqlite3');
const { digest } = require('./canonical');

function messageKey(message) {
  return digest([message.scope, message.conversationId, message.sender, message.idempotencyKey]);
}

class EvidenceStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence_protocol_claims (
        id TEXT PRIMARY KEY, state TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evidence_protocol_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL UNIQUE, idempotency_key TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL, message TEXT NOT NULL, result TEXT NOT NULL
      );
    `);
  }

  version() {
    return this.db.prepare('SELECT COALESCE(MAX(sequence), 0) AS version FROM evidence_protocol_events').get().version;
  }

  replay(message) {
    const rows = this.db.prepare(`SELECT * FROM evidence_protocol_events
      WHERE message_id = ? OR idempotency_key = ?`).all(message.messageId, messageKey(message));
    if (!rows.length) return null;
    const fingerprint = digest(message);
    if (rows.some((row) => row.fingerprint !== fingerprint)) throw new Error('EVIDENCE idempotency conflict.');
    return JSON.parse(rows[0].result);
  }

  claim(id) {
    const row = this.db.prepare('SELECT state FROM evidence_protocol_claims WHERE id = ?').get(id);
    return row ? JSON.parse(row.state) : null;
  }

  claims() {
    return this.db.prepare('SELECT state FROM evidence_protocol_claims ORDER BY id').all().map((row) => JSON.parse(row.state));
  }

  history() {
    return this.db.prepare('SELECT sequence, message, result FROM evidence_protocol_events ORDER BY sequence').all()
      .map((row) => ({ sequence: row.sequence, message: JSON.parse(row.message), result: JSON.parse(row.result) }));
  }

  commit(change) {
    return this.db.transaction(() => {
      const replay = this.replay(change.message);
      if (replay) return replay;
      if (this.version() !== change.version) throw new Error('EVIDENCE state changed during verification; retry.');
      const write = this.db.prepare('INSERT OR REPLACE INTO evidence_protocol_claims (id,state) VALUES (?,?)');
      for (const state of change.states) write.run(state.claim.claimId, JSON.stringify(state));
      this.db.prepare(`INSERT INTO evidence_protocol_events
        (message_id,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`)
        .run(change.message.messageId, messageKey(change.message), digest(change.message),
          JSON.stringify(change.message), JSON.stringify(change.result));
      return change.result;
    }).immediate();
  }

  close() { this.db.close(); }
}

module.exports = { EvidenceStore };
