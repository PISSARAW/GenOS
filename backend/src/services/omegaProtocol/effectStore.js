'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

class EffectStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = FULL'); this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS omega_effect_intents (effect_key TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS omega_effect_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, effect_key TEXT NOT NULL, event TEXT NOT NULL);`);
    this.db.transaction(() => {
      const rows = this.db.prepare("SELECT state FROM omega_effect_intents WHERE json_extract(state,'$.status')='dispatching'").all();
      for (const row of rows) {
        const state = JSON.parse(row.state);
        state.status = 'effect_outcome_unknown';
        state.reason = 'Recovered durable dispatch intent without a recorded receipt.';
        this.change(state, 'EFFECT_OUTCOME_UNKNOWN');
      }
    }).immediate();
  }

  state(key) {
    const row = this.db.prepare('SELECT state FROM omega_effect_intents WHERE effect_key=?').get(key);
    return row ? JSON.parse(row.state) : null;
  }

  save(state) {
    this.db.prepare('INSERT OR REPLACE INTO omega_effect_intents(effect_key,state) VALUES (?,?)').run(state.request.effectKey, JSON.stringify(state));
  }

  match(request) {
    const state = this.state(request.effectKey);
    if (state && digest(state.request) !== digest(request)) throw new Error('OMEGA effect key idempotency conflict.');
    return state;
  }

  compare(expected) {
    if (digest(this.state(expected.request.effectKey)) !== digest(expected)) throw new Error('OMEGA effect state changed; reconcile.');
  }

  change(state, event) {
    this.save(state);
    this.db.prepare('INSERT INTO omega_effect_events(effect_key,event) VALUES (?,?)').run(state.request.effectKey, event);
  }

  history(key) {
    return this.db.prepare('SELECT sequence,event FROM omega_effect_events WHERE effect_key=? ORDER BY sequence').all(key);
  }

  atomic(callback) { return this.db.transaction(callback).immediate(); }
  close() { this.db.close(); }
}

module.exports = { EffectStore };
