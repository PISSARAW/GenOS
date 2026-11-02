'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

function runKey(query) { return digest([query.scope, query.missionId, query.conversationId, query.runId]); }
function messageKey(message) {
  return digest([message.scope, message.missionId, message.conversationId, message.sender, message.audience, message.idempotencyKey]);
}

class ExecutionStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS omega_protocol_runs (
      run_key TEXT PRIMARY KEY, binding TEXT NOT NULL, owner TEXT NOT NULL, status TEXT NOT NULL, result TEXT
    ); CREATE TABLE IF NOT EXISTS omega_protocol_effects (
      run_key TEXT NOT NULL, step_id TEXT NOT NULL, request TEXT NOT NULL, receipt TEXT,
      PRIMARY KEY (run_key,step_id)
    ); CREATE TABLE IF NOT EXISTS omega_protocol_execution_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, message TEXT NOT NULL, result TEXT NOT NULL
    );`);
    this.journal = {
      exec: async (sql) => this.db.exec(sql),
      get: async (sql, ...parameters) => this.db.prepare(sql).get(...parameters),
      run: async (sql, ...parameters) => this.db.prepare(sql).run(...parameters),
    };
  }

  state(query) {
    const row = this.db.prepare('SELECT * FROM omega_protocol_runs WHERE run_key = ?').get(runKey(query));
    return row ? { binding: JSON.parse(row.binding), owner: row.owner, status: row.status,
      result: row.result ? JSON.parse(row.result) : null } : null;
  }

  begin(binding, options) {
    return this.db.transaction(() => {
      const existing = this.state(binding);
      if (existing && digest(existing.binding) !== digest(binding)) throw new Error('OMEGA run binding conflict.');
      if (existing?.status === 'completed' || existing?.status === 'blocked') return existing;
      if (existing && options.type !== 'RESUME') throw new Error('OMEGA execution in progress; explicit RESUME required.');
      this.db.prepare(`INSERT INTO omega_protocol_runs (run_key,binding,owner,status) VALUES (?,?,?,'running')
        ON CONFLICT(run_key) DO UPDATE SET owner = excluded.owner, status = 'running'`)
        .run(runKey(binding), JSON.stringify(binding), options.owner);
      return this.state(binding);
    }).immediate();
  }

  owned(binding, owner) {
    if (this.state(binding)?.owner !== owner) throw new Error('OMEGA execution ownership changed.');
  }

  finish(binding, update) {
    this.owned(binding, update.owner);
    this.db.prepare('UPDATE omega_protocol_runs SET status = ?,result = ? WHERE run_key = ? AND owner = ?')
      .run(update.status, JSON.stringify(update.result), runKey(binding), update.owner);
  }

  effect(binding, stepId) {
    const row = this.db.prepare('SELECT request,receipt FROM omega_protocol_effects WHERE run_key = ? AND step_id = ?')
      .get(runKey(binding), stepId);
    return row ? { request: JSON.parse(row.request), receipt: row.receipt ? JSON.parse(row.receipt) : null } : null;
  }

  saveEffect(binding, effect) {
    this.db.transaction(() => {
      const existing = this.effect(binding, effect.stepId);
      if (existing && digest(existing.request) !== digest(effect.request)) throw new Error('OMEGA persisted effect request conflict.');
      if (existing?.receipt && effect.receipt && digest(existing.receipt) !== digest(effect.receipt)) {
        throw new Error('OMEGA persisted effect receipt conflict.');
      }
      this.db.prepare(`INSERT INTO omega_protocol_effects (run_key,step_id,request,receipt) VALUES (?,?,?,?)
        ON CONFLICT(run_key,step_id) DO UPDATE SET receipt = COALESCE(excluded.receipt,omega_protocol_effects.receipt)`)
        .run(runKey(binding), effect.stepId, JSON.stringify(effect.request), effect.receipt ? JSON.stringify(effect.receipt) : null);
    }).immediate();
  }

  replay(message) {
    const key = messageKey(message);
    const rows = this.db.prepare('SELECT fingerprint,result FROM omega_protocol_execution_events WHERE message_id = ? OR idempotency_key = ?')
      .all(message.messageId, key);
    if (rows.some((row) => row.fingerprint !== digest(message))) throw new Error('OMEGA message idempotency conflict.');
    return rows.length ? JSON.parse(rows[0].result) : null;
  }

  record(message, result) {
    return this.db.transaction(() => {
      const replay = this.replay(message);
      if (replay) return replay;
      this.db.prepare(`INSERT INTO omega_protocol_execution_events
        (message_id,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`)
        .run(message.messageId, messageKey(message), digest(message), JSON.stringify(message), JSON.stringify(result));
      return result;
    }).immediate();
  }

  history() {
    return this.db.prepare('SELECT sequence,message,result FROM omega_protocol_execution_events ORDER BY sequence').all()
      .map((row) => ({ sequence: row.sequence, message: JSON.parse(row.message), result: JSON.parse(row.result) }));
  }

  close() { this.db.close(); }
}

module.exports = { ExecutionStore, runKey };
