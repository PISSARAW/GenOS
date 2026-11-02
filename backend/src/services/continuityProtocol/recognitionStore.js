'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

const sessionKey = (context) => digest([context.scope, context.missionId, context.conversationId]);
const messageKey = (message) => digest([sessionKey(message), message.sender, message.audience, message.idempotencyKey]);

class RecognitionStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS continuity_recognition_sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS continuity_recognition_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL, message TEXT NOT NULL, result TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS continuity_recognition_nonces (
        nonce TEXT PRIMARY KEY, session_id TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  version() {
    return this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS version FROM continuity_recognition_events').get().version;
  }

  state(context) {
    const row = this.db.prepare('SELECT state FROM continuity_recognition_sessions WHERE id=?').get(sessionKey(context));
    return row ? JSON.parse(row.state) : null;
  }

  replay(message) {
    const rows = this.db.prepare(`SELECT fingerprint,result FROM continuity_recognition_events
      WHERE message_id=? OR idempotency_key=?`).all(message.messageId, messageKey(message));
    if (!rows.length) return null;
    if (rows.some((row) => row.fingerprint !== digest(message))) throw new Error('CONTINUITY recognition idempotency conflict.');
    return JSON.parse(rows[0].result);
  }

  history() {
    return this.db.prepare('SELECT sequence,message,result FROM continuity_recognition_events ORDER BY sequence').all()
      .map((row) => ({ sequence: row.sequence, message: JSON.parse(row.message), result: JSON.parse(row.result) }));
  }

  nonce(change) {
    const id = sessionKey(change.message);
    if (change.message.type === 'CHALLENGE') {
      const value = change.message.payload.nonce;
      if (this.db.prepare('SELECT 1 FROM continuity_recognition_nonces WHERE nonce=?').get(value)) {
        throw new Error('CONTINUITY recognition nonce already used.');
      }
      this.db.prepare('INSERT INTO continuity_recognition_nonces (nonce,session_id) VALUES (?,?)').run(value, id);
    }
    if (change.message.type === 'ATTEST') {
      const changed = this.db.prepare(`UPDATE continuity_recognition_nonces SET consumed=1
        WHERE nonce=? AND session_id=? AND consumed=0`).run(change.message.payload.nonce, id);
      if (changed.changes !== 1) throw new Error('CONTINUITY recognition nonce already consumed.');
    }
  }

  commit(change) {
    return this.db.transaction(() => {
      const replay = this.replay(change.message);
      if (replay) return replay;
      if (this.version() !== change.version) throw new Error('CONTINUITY recognition state changed during verification; retry.');
      this.nonce(change);
      this.db.prepare('INSERT OR REPLACE INTO continuity_recognition_sessions (id,state) VALUES (?,?)')
        .run(sessionKey(change.message), JSON.stringify(change.state));
      this.db.prepare(`INSERT INTO continuity_recognition_events
        (message_id,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`)
        .run(change.message.messageId, messageKey(change.message), digest(change.message),
          JSON.stringify(change.message), JSON.stringify(change.result));
      return change.result;
    }).immediate();
  }

  close() { this.db.close(); }
}

module.exports = { RecognitionStore };
