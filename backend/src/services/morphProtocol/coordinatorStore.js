'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

function messageKey(message) {
  return digest([message.scope, message.conversationId, message.sender, message.idempotencyKey]);
}

class CoordinatorStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS morph_coordinator_transitions (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS morph_coordinator_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
        message TEXT NOT NULL, result TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS morph_coordinator_decisions (transition_id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS morph_coordinator_organizations (
        scope_key TEXT PRIMARY KEY, version INTEGER NOT NULL, snapshot_digest TEXT NOT NULL
      );`);
  }

  state(id) {
    const row = this.db.prepare('SELECT state FROM morph_coordinator_transitions WHERE id = ?').get(id);
    return row ? JSON.parse(row.state) : null;
  }

  decision(id) {
    const row = this.db.prepare('SELECT body FROM morph_coordinator_decisions WHERE transition_id = ?').get(id);
    return row ? JSON.parse(row.body) : null;
  }

  replay(message) {
    const rows = this.db.prepare(`SELECT fingerprint,result FROM morph_coordinator_events
      WHERE message_id = ? OR idempotency_key = ?`).all(message.messageId, messageKey(message));
    if (!rows.length) return null;
    if (rows.some((row) => row.fingerprint !== digest(message))) throw new Error('MORPH idempotency conflict.');
    return JSON.parse(rows[0].result);
  }

  ensureSource(state) {
    const scopeKey = digest(state.context.scope);
    this.db.prepare(`INSERT OR IGNORE INTO morph_coordinator_organizations
      (scope_key,version,snapshot_digest) VALUES (?,?,?)`)
      .run(scopeKey, state.plan.sourceVersion, state.checkpointDigest);
    const current = this.db.prepare('SELECT version,snapshot_digest FROM morph_coordinator_organizations WHERE scope_key = ?').get(scopeKey);
    if (current.version !== state.plan.sourceVersion || current.snapshot_digest !== state.checkpointDigest) {
      throw new Error('MORPH authoritative organization source version or snapshot conflict.');
    }
  }

  advanceOrganization(state) {
    const result = this.db.prepare(`UPDATE morph_coordinator_organizations SET version = ?, snapshot_digest = ?
      WHERE scope_key = ? AND version = ? AND snapshot_digest = ?`)
      .run(state.plan.targetVersion, digest(state.plan.targetSnapshot), digest(state.context.scope),
        state.plan.sourceVersion, state.checkpointDigest);
    if (result.changes !== 1) throw new Error('MORPH organization version CAS rejected.');
  }

  commit(change) {
    return this.db.transaction(() => {
      const replay = this.replay(change.message);
      if (replay) return replay;
      if (digest(this.state(change.state.transitionId)) !== digest(change.expected)) throw new Error('MORPH coordinator changed concurrently; retry.');
      if (change.ensureSource) this.ensureSource(change.state);
      if (change.advanceOrganization) this.advanceOrganization(change.state);
      if (change.decision) this.db.prepare('INSERT INTO morph_coordinator_decisions (transition_id,body) VALUES (?,?)')
        .run(change.state.transitionId, JSON.stringify(change.decision));
      this.db.prepare('INSERT OR REPLACE INTO morph_coordinator_transitions (id,state) VALUES (?,?)')
        .run(change.state.transitionId, JSON.stringify(change.state));
      this.db.prepare(`INSERT INTO morph_coordinator_events
        (message_id,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`)
        .run(change.message.messageId, messageKey(change.message), digest(change.message),
          JSON.stringify(change.message), JSON.stringify(change.result));
      return change.result;
    }).immediate();
  }

  history() {
    return this.db.prepare('SELECT * FROM morph_coordinator_events ORDER BY sequence').all()
      .map((row) => ({ sequence: row.sequence, message: JSON.parse(row.message), result: JSON.parse(row.result) }));
  }

  close() { this.db.close(); }
}

module.exports = { CoordinatorStore };
