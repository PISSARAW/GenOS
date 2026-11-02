'use strict';

const { digest } = require('../evidenceProtocol/canonical');

const key = (query, kind) => digest([query.scope, query.missionId, query.conversationId, query[`${kind}Id`]]);
const messageKey = (message, field) => digest([message.scope, message.missionId, message.conversationId,
  message.sender, message.audience, message[field]]);

class ObservationStore {
  constructor(db) { this.db = db; }

  async initialize() {
    await this.db.exec(`CREATE TABLE IF NOT EXISTS allostasis_reports (identity TEXT PRIMARY KEY,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS allostasis_forecasts (identity TEXT PRIMARY KEY,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS allostasis_observation_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,message_key TEXT UNIQUE NOT NULL,idempotency_key TEXT UNIQUE NOT NULL,
        fingerprint TEXT NOT NULL,message TEXT NOT NULL,result TEXT NOT NULL
      );`);
  }

  async read(query, kind) {
    const table = kind === 'report' ? 'allostasis_reports' : 'allostasis_forecasts';
    const row = await this.db.get(`SELECT state FROM ${table} WHERE identity=?`, key(query, kind));
    return row ? JSON.parse(row.state) : null;
  }

  async write(query, kind, state) {
    const table = kind === 'report' ? 'allostasis_reports' : 'allostasis_forecasts';
    await this.db.run(`INSERT INTO ${table}(identity,state) VALUES (?,?)`, key(query, kind), JSON.stringify(state));
  }

  async replay(message) {
    const rows = await this.db.all('SELECT fingerprint,result FROM allostasis_observation_events WHERE message_key=? OR idempotency_key=?',
      messageKey(message, 'messageId'), messageKey(message, 'idempotencyKey'));
    if (rows.some(row => row.fingerprint !== digest(message))) throw new Error('ALLOSTASIS observation idempotency conflict.');
    return rows.length ? JSON.parse(rows[0].result) : null;
  }

  async record(message, result) {
    await this.db.run(`INSERT INTO allostasis_observation_events
      (message_key,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`,
    messageKey(message, 'messageId'), messageKey(message, 'idempotencyKey'), digest(message), JSON.stringify(message), JSON.stringify(result));
  }
}

module.exports = { ObservationStore };
