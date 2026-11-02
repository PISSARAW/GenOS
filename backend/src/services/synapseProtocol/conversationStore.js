'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

const resourceKey = (query) => digest([query.scope, query.missionId, query.contextId]);
const dialogueKey = (query) => digest([query.scope, query.missionId, query.conversationId, query.contextId]);
const frameKey = (query) => digest([query.scope, query.missionId, query.conversationId]);
const deltaKey = (query) => digest([query.scope, query.missionId, query.conversationId, query.deltaId]);
const messageKey = (message) => digest([message.scope, message.missionId, message.conversationId, message.sender, message.audience, message.idempotencyKey]);

class ConversationStore {
  constructor(filename) {
    this.raw = new Database(filename);
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('busy_timeout = 5000');
    this.raw.exec(`CREATE TABLE IF NOT EXISTS synapse_documents (
      resource_key TEXT PRIMARY KEY, generation INTEGER NOT NULL, state_digest TEXT NOT NULL, value_json TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS synapse_document_history (
      resource_key TEXT NOT NULL, generation INTEGER NOT NULL, state_digest TEXT NOT NULL, value_json TEXT NOT NULL,
      PRIMARY KEY (resource_key,generation)
    ); CREATE TABLE IF NOT EXISTS synapse_dialogues (
      dialogue_key TEXT PRIMARY KEY, frame_key TEXT NOT NULL, context_digest TEXT NOT NULL, body_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS synapse_deltas (delta_key TEXT PRIMARY KEY, body_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS synapse_state_receipts (delta_key TEXT PRIMARY KEY, body_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS synapse_conversation_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, idempotency_key TEXT UNIQUE NOT NULL,
      fingerprint TEXT NOT NULL, message_json TEXT NOT NULL, result_json TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS synapse_outbox (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL,
      dialogue_key TEXT NOT NULL, body_json TEXT NOT NULL, body_digest TEXT NOT NULL
    );`);
    this.db = { exec: async (sql) => this.raw.exec(sql), get: async (sql, ...parameters) => this.raw.prepare(sql).get(...parameters),
      all: async (sql, ...parameters) => this.raw.prepare(sql).all(...parameters),
      run: async (sql, ...parameters) => this.raw.prepare(sql).run(...parameters) };
  }

  document(query) {
    const row = this.raw.prepare('SELECT * FROM synapse_documents WHERE resource_key = ?').get(resourceKey(query));
    if (!row) return null;
    const value = JSON.parse(row.value_json);
    if (digest(value) !== row.state_digest) throw new Error('SYNAPSE stored JSON document integrity mismatch.');
    return { value, stateDigest: row.state_digest, generation: row.generation };
  }

  writeDocument(query, state, expected) {
    const key = resourceKey(query);
    if (expected) {
      const result = this.raw.prepare('UPDATE synapse_documents SET generation = ?,state_digest = ?,value_json = ? WHERE resource_key = ? AND generation = ? AND state_digest = ?')
        .run(state.generation, state.stateDigest, JSON.stringify(state.value), key, expected.generation, expected.stateDigest);
      if (result.changes !== 1) throw new Error('SYNAPSE document revision CAS rejected.');
    } else this.raw.prepare('INSERT INTO synapse_documents VALUES (?,?,?,?)').run(key, state.generation, state.stateDigest, JSON.stringify(state.value));
    this.raw.prepare('INSERT INTO synapse_document_history VALUES (?,?,?,?)').run(key, state.generation, state.stateDigest, JSON.stringify(state.value));
  }

  read(table, keyColumn, key) {
    const row = this.raw.prepare(`SELECT body_json FROM ${table} WHERE ${keyColumn} = ?`).get(key);
    return row ? JSON.parse(row.body_json) : null;
  }

  dialogue(query) { return this.read('synapse_dialogues', 'dialogue_key', dialogueKey(query)); }
  transfer(query) { return this.read('synapse_deltas', 'delta_key', deltaKey(query)); }
  receipt(query) { return this.read('synapse_state_receipts', 'delta_key', deltaKey(query)); }

  writeDialogue(value) {
    this.raw.prepare('INSERT OR REPLACE INTO synapse_dialogues VALUES (?,?,?,?)')
      .run(dialogueKey(value.query), frameKey(value.query), value.contextDigest, JSON.stringify(value));
  }

  forContext(query, contextDigest) {
    const row = this.raw.prepare('SELECT body_json FROM synapse_dialogues WHERE frame_key = ? AND context_digest = ?')
      .get(frameKey(query), contextDigest);
    return row ? JSON.parse(row.body_json) : null;
  }

  writeTransfer(value) {
    this.raw.prepare('INSERT OR REPLACE INTO synapse_deltas VALUES (?,?)').run(deltaKey(value.query), JSON.stringify(value));
  }

  writeReceipt(query, body) {
    this.raw.prepare('INSERT INTO synapse_state_receipts VALUES (?,?)').run(deltaKey(query), JSON.stringify(body));
  }

  assertReceipt(query, body) {
    const row = this.raw.prepare('SELECT value_json,state_digest FROM synapse_document_history WHERE resource_key = ? AND generation = ?')
      .get(resourceKey(query), body.generation);
    if (!row || row.state_digest !== body.resultDigest || digest(JSON.parse(row.value_json)) !== body.resultDigest) {
      throw new Error('SYNAPSE applied receipt has no matching durable JSON history.');
    }
    const { receiptDigest, ...value } = body;
    if (receiptDigest !== digest({ profile: 'genos.synapse.state-receipt/v1', ...value })) throw new Error('SYNAPSE applied receipt integrity mismatch.');
  }

  replay(message) {
    const rows = this.raw.prepare('SELECT fingerprint,result_json FROM synapse_conversation_events WHERE message_id = ? OR idempotency_key = ?')
      .all(message.messageId, messageKey(message));
    if (rows.some((row) => row.fingerprint !== digest(message))) throw new Error('SYNAPSE message idempotency conflict.');
    return rows.length ? JSON.parse(rows[0].result_json) : null;
  }

  record(message, result) {
    this.raw.prepare('INSERT INTO synapse_conversation_events (message_id,idempotency_key,fingerprint,message_json,result_json) VALUES (?,?,?,?,?)')
      .run(message.messageId, messageKey(message), digest(message), JSON.stringify(message), JSON.stringify(result));
  }

  enqueue(query, message) {
    this.raw.prepare('INSERT INTO synapse_outbox (message_id,dialogue_key,body_json,body_digest) VALUES (?,?,?,?)')
      .run(message.messageId, dialogueKey(query), JSON.stringify(message), digest(message));
  }

  outbox(query) {
    return this.raw.prepare('SELECT body_json,body_digest FROM synapse_outbox WHERE dialogue_key = ? ORDER BY sequence').all(dialogueKey(query))
      .map((row) => { const message = JSON.parse(row.body_json);
        if (digest(message) !== row.body_digest) throw new Error('SYNAPSE outbox integrity mismatch.');
        return message; });
  }

  close() { this.raw.close(); }
}

module.exports = { ConversationStore, resourceKey, dialogueKey, deltaKey };
