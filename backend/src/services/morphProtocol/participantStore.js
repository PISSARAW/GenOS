'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

class ParticipantStore {
  constructor(filename, participant) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS morph_participant_identity (id INTEGER PRIMARY KEY, identity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS morph_participant_state (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS morph_participant_bindings (id TEXT PRIMARY KEY, binding TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS morph_participant_receipts (id TEXT PRIMARY KEY, receipt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS morph_participant_actions (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        fingerprint TEXT NOT NULL, action TEXT NOT NULL, result TEXT NOT NULL
      );`);
    this.db.prepare('INSERT OR IGNORE INTO morph_participant_identity(id,identity) VALUES (1,?)').run(JSON.stringify(participant));
    const bound = JSON.parse(this.db.prepare('SELECT identity FROM morph_participant_identity WHERE id=1').get().identity);
    if (digest(bound) !== digest(participant)) {
      this.db.close();
      throw new Error('MORPH participant database belongs to another identity.');
    }
  }

  state(scope) {
    const row = this.db.prepare('SELECT state FROM morph_participant_state WHERE id=?').get(digest(scope));
    return row ? JSON.parse(row.state) : null;
  }

  save(state) {
    this.db.prepare('INSERT OR REPLACE INTO morph_participant_state(id,state) VALUES (?,?)')
      .run(digest(state.scope), JSON.stringify(state));
  }

  compare(expected) {
    if (digest(this.state(expected.scope)) !== digest(expected)) throw new Error('MORPH participant state changed; retry.');
  }

  receipt(status, binding) {
    const row = this.db.prepare('SELECT receipt FROM morph_participant_receipts WHERE id=?').get(digest([status, binding]));
    return row ? JSON.parse(row.receipt) : null;
  }

  recordReceipt(status, binding, receipt) {
    this.db.prepare('INSERT INTO morph_participant_receipts(id,receipt) VALUES (?,?)')
      .run(digest([status, binding]), JSON.stringify(receipt));
  }

  bind(query) {
    const id = digest([query.scope, query.transitionId]);
    const row = this.db.prepare('SELECT binding FROM morph_participant_bindings WHERE id=?').get(id);
    if (row && digest(JSON.parse(row.binding)) !== digest(query)) throw new Error('MORPH transition idempotency conflict.');
    if (!row) this.db.prepare('INSERT INTO morph_participant_bindings(id,binding) VALUES (?,?)').run(id, JSON.stringify(query));
  }

  action(value) {
    const id = digest([value.scope, value.actor, value.operationId]);
    const row = this.db.prepare('SELECT fingerprint,result FROM morph_participant_actions WHERE id=?').get(id);
    if (row) {
      if (row.fingerprint !== digest(value)) throw new Error('MORPH action idempotency conflict.');
      return JSON.parse(row.result);
    }
    const result = { status: 'applied', operationId: value.operationId, version: value.version };
    this.db.prepare('INSERT INTO morph_participant_actions(id,fingerprint,action,result) VALUES (?,?,?,?)')
      .run(id, digest(value), JSON.stringify(value), JSON.stringify(result));
    return result;
  }

  atomic(callback) { return this.db.transaction(callback).immediate(); }
  close() { this.db.close(); }
}

module.exports = { ParticipantStore };
