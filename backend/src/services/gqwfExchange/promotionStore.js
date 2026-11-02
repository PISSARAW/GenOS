'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { withTransaction } = require('../../db');

const candidateKey = query => digest([query.scope, query.missionId, query.conversationId, query.candidateId]);
const messageKey = (message, field) => digest([message.scope, message.missionId, message.conversationId,
  message.sender, message.audience, message[field]]);

class PromotionStore {
  constructor(db) { this.db = db; }

  async initialize() {
    await this.db.exec(`CREATE TABLE IF NOT EXISTS gqwf_exchange_candidates (
      candidate_key TEXT PRIMARY KEY, state TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS gqwf_exchange_promotion_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_key TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, message TEXT NOT NULL, result TEXT NOT NULL
    );`);
  }

  async state(query) {
    return withTransaction(this.db, async () => {
      const row = await this.db.get('SELECT state FROM gqwf_exchange_candidates WHERE candidate_key=?', candidateKey(query));
      return row ? JSON.parse(row.state) : null;
    });
  }

  async replay(message) {
    return withTransaction(this.db, async () => {
      const rows = await this.db.all(`SELECT fingerprint,result FROM gqwf_exchange_promotion_events
        WHERE message_key=? OR idempotency_key=?`, messageKey(message, 'messageId'), messageKey(message, 'idempotencyKey'));
      if (rows.some(row => row.fingerprint !== digest(message))) throw new Error('GQWF Exchange promotion idempotency conflict.');
      return rows.length ? JSON.parse(rows[0].result) : null;
    });
  }

  async compare(query, expected) {
    if (digest(await this.state(query)) !== digest(expected)) throw new Error('GQWF Exchange candidate changed concurrently; retry.');
  }

  async persist(change) {
    const replay = await this.replay(change.message);
    if (replay) return replay;
    await this.compare(change.query, change.expected);
    await this.db.run('INSERT OR REPLACE INTO gqwf_exchange_candidates(candidate_key,state) VALUES (?,?)',
      candidateKey(change.query), JSON.stringify(change.state));
    await this.db.run(`INSERT INTO gqwf_exchange_promotion_events
      (message_key,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`,
    messageKey(change.message, 'messageId'), messageKey(change.message, 'idempotencyKey'), digest(change.message),
    JSON.stringify(change.message), JSON.stringify(change.result));
    return change.result;
  }

  commit(change) {
    return withTransaction(this.db, async () => {
      if (change.validate) await change.validate();
      return this.persist(change);
    });
  }
}

module.exports = { PromotionStore };
