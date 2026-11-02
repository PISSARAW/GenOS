'use strict';

const Database = require('better-sqlite3');
const { withTransaction } = require('../../db');
const { digest } = require('../evidenceProtocol/canonical');

const queryKey = query => digest([query.scope, query.missionId, query.conversationId, query.deltaId, query.deltaDigest]);
const messageKey = (message, field) => digest([message.scope, message.missionId, message.conversationId,
  message.sender, message.audience, message[field]]);

class AckStore {
  constructor(filename) {
    this.raw = new Database(filename);
    try { this.initialize(); }
    catch (error) { this.raw.close(); throw error; }
    this.db = { exec: async sql => this.raw.exec(sql), get: async (sql, ...args) => this.raw.prepare(sql).get(...args),
      all: async (sql, ...args) => this.raw.prepare(sql).all(...args), run: async (sql, ...args) => this.raw.prepare(sql).run(...args) };
  }

  initialize() {
    this.raw.pragma('journal_mode = WAL'); this.raw.pragma('synchronous = FULL'); this.raw.pragma('busy_timeout = 5000');
    this.raw.exec(`CREATE TABLE IF NOT EXISTS synapse_ack_facts (
      query_key TEXT NOT NULL, ack_id TEXT NOT NULL, fingerprint TEXT NOT NULL, state TEXT NOT NULL,
      PRIMARY KEY(query_key,ack_id)
    ); CREATE TABLE IF NOT EXISTS synapse_ack_messages (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_key TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, message TEXT NOT NULL, result TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS synapse_ack_observations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, query_key TEXT NOT NULL, ack_id TEXT NOT NULL, receipt TEXT NOT NULL
    );`);
  }

  fact(query, ackId) {
    const row = this.raw.prepare('SELECT state FROM synapse_ack_facts WHERE query_key=? AND ack_id=?').get(queryKey(query), ackId);
    return row ? JSON.parse(row.state) : null;
  }

  facts(query) {
    return this.raw.prepare('SELECT state FROM synapse_ack_facts WHERE query_key=? ORDER BY ack_id').all(queryKey(query))
      .map(row => JSON.parse(row.state));
  }

  replay(message) {
    const rows = this.raw.prepare(`SELECT fingerprint,result FROM synapse_ack_messages WHERE message_key=? OR idempotency_key=?`)
      .all(messageKey(message, 'messageId'), messageKey(message, 'idempotencyKey'));
    if (rows.some(row => row.fingerprint !== digest(message))) throw new Error('SYNAPSE ACK message idempotency conflict.');
    return rows.length ? JSON.parse(rows[0].result) : null;
  }

  async snapshot(message) { return withTransaction(this.db, async () => this.replay(message)); }

  observe(state) {
    this.raw.prepare('INSERT INTO synapse_ack_observations(query_key,ack_id,receipt) VALUES (?,?,?)')
      .run(queryKey(state.query), state.message.payload.ackId, JSON.stringify(state.receipt));
  }

  commit(change) {
    return withTransaction(this.db, async () => {
      await change.validate();
      const replay = this.replay(change.message);
      if (replay) return replay;
      const previous = this.fact(change.state.query, change.message.payload.ackId);
      if (previous) throw new Error('SYNAPSE ACK fact identifier already bound; use a new acknowledgement.');
      this.raw.prepare('INSERT INTO synapse_ack_facts(query_key,ack_id,fingerprint,state) VALUES (?,?,?,?)')
        .run(queryKey(change.state.query), change.message.payload.ackId, digest(change.message), JSON.stringify(change.state));
      this.observe(change.state);
      this.raw.prepare(`INSERT INTO synapse_ack_messages(message_key,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`)
        .run(messageKey(change.message, 'messageId'), messageKey(change.message, 'idempotencyKey'), digest(change.message),
          JSON.stringify(change.message), JSON.stringify(change.state.receipt));
      return change.state.receipt;
    });
  }

  reconcile(change) {
    return withTransaction(this.db, async () => {
      await change.validate();
      const current = this.fact(change.expected.query, change.expected.message.payload.ackId);
      if (digest(current) !== digest(change.expected)) throw new Error('SYNAPSE ACK observation changed concurrently; reread.');
      this.raw.prepare('UPDATE synapse_ack_facts SET state=? WHERE query_key=? AND ack_id=?')
        .run(JSON.stringify(change.state), queryKey(change.state.query), change.state.message.payload.ackId);
      this.observe(change.state);
      return change.state.receipt;
    });
  }

  history(query, ackId) {
    return this.raw.prepare('SELECT sequence,receipt FROM synapse_ack_observations WHERE query_key=? AND ack_id=? ORDER BY sequence')
      .all(queryKey(query), ackId).map(row => ({ sequence: row.sequence, receipt: JSON.parse(row.receipt) }));
  }

  close() { this.raw.close(); }
}

module.exports = { AckStore };
