'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');
const v = require('./allocatorBindings');

const poolKey = (query) => digest(query);
const allocationKey = (query) => digest([query.scope, query.missionId, query.conversationId, query.allocationId]);
const requestKey = (message) => digest([message.scope, message.missionId, message.conversationId,
  message.sender, message.audience, message.payload.requestId]);
const messageKey = (message, field) => digest([message.scope, message.missionId, message.conversationId,
  message.sender, message.audience, message[field]]);
const requestFingerprint = (message) => digest({ payload: message.payload, authority: message.authority,
  generations: message.generations, expiresAt: message.expiresAt });

class AllocatorStore {
  constructor(filename) {
    this.raw = new Database(filename);
    try { this.initialize(); } catch (error) { this.raw.close(); throw error; }
    this.db = { exec: async (sql) => this.raw.exec(sql), get: async (sql, ...parameters) => this.raw.prepare(sql).get(...parameters),
      all: async (sql, ...parameters) => this.raw.prepare(sql).all(...parameters),
      run: async (sql, ...parameters) => this.raw.prepare(sql).run(...parameters) };
  }

  initialize() {
    this.raw.pragma('journal_mode = WAL'); this.raw.pragma('synchronous = FULL'); this.raw.pragma('busy_timeout = 5000');
    this.raw.exec(`CREATE TABLE IF NOT EXISTS allostasis_pools (pool_key TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS allostasis_allocations (allocation_key TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS allostasis_requests (request_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS allostasis_allocator_messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_key TEXT UNIQUE NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, message TEXT NOT NULL, result TEXT NOT NULL
      ); CREATE TABLE IF NOT EXISTS allostasis_grant_outbox (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, pool_key TEXT NOT NULL, message_key TEXT UNIQUE NOT NULL,
        message TEXT NOT NULL, fingerprint TEXT NOT NULL
      );`);
  }

  pool(query) {
    const row = this.raw.prepare('SELECT body FROM allostasis_pools WHERE pool_key = ?').get(poolKey(query));
    return row ? JSON.parse(row.body) : null;
  }

  allocation(query) {
    const row = this.raw.prepare('SELECT body FROM allostasis_allocations WHERE allocation_key = ?').get(allocationKey(query));
    const result = row ? JSON.parse(row.body) : null;
    return result && v.same(result.query, query) ? result : null;
  }

  writePool(next, expected) {
    ['capacity', 'protectedReserve', 'baselineConsumed', 'consumed', 'held', 'generation'].forEach((key) => v.amount(next[key]));
    if (!expected) {
      this.raw.prepare('INSERT INTO allostasis_pools VALUES (?,?)').run(poolKey(next.query), JSON.stringify(next));
      return;
    }
    const fixed = (value) => [value.query, value.capacity, value.protectedReserve, value.baselineConsumed, value.regulator];
    if (!v.same(fixed(next), fixed(expected)) || next.consumed < expected.consumed || next.generation !== expected.generation + 1) {
      throw new Error('ALLOSTASIS pool immutable limits or monotone consumption changed.');
    }
    if (!v.same(this.pool(expected.query), expected)) throw new Error('ALLOSTASIS pool generation CAS rejected.');
    this.raw.prepare('UPDATE allostasis_pools SET body = ? WHERE pool_key = ?').run(JSON.stringify(next), poolKey(next.query));
  }

  writeAllocation(next, expected) {
    ['spent', 'held', 'released', 'unknownExposure', 'generation'].forEach((key) => v.amount(next[key]));
    if (!expected) {
      this.raw.prepare('INSERT INTO allostasis_allocations VALUES (?,?)').run(allocationKey(next.query), JSON.stringify(next));
      return;
    }
    if (!v.same(next.query, expected.query) || !v.same(next.allocation, expected.allocation) || !v.same(next.poolQuery, expected.poolQuery)
      || next.spent < expected.spent || next.released < expected.released || next.generation !== expected.generation + 1) {
      throw new Error('ALLOSTASIS allocation immutable binding or monotone accounting changed.');
    }
    if (!v.same(next.verification ?? null, expected.verification ?? null)) throw new Error('ALLOSTASIS durable admission evidence cannot be rewritten.');
    if (!v.same(this.allocation(expected.query), expected)) throw new Error('ALLOSTASIS allocation generation CAS rejected.');
    this.raw.prepare('UPDATE allostasis_allocations SET body = ? WHERE allocation_key = ?').run(JSON.stringify(next), allocationKey(next.query));
  }

  requested(message) {
    const row = this.raw.prepare('SELECT fingerprint,result FROM allostasis_requests WHERE request_key = ?').get(requestKey(message));
    if (row && row.fingerprint !== requestFingerprint(message)) throw new Error('ALLOSTASIS request identity already has another payload or authority context.');
    return row ? JSON.parse(row.result) : null;
  }

  recordRequest(message, result) {
    this.raw.prepare('INSERT INTO allostasis_requests VALUES (?,?,?)').run(requestKey(message), requestFingerprint(message), JSON.stringify(result));
  }

  replay(message) {
    const rows = this.raw.prepare('SELECT fingerprint,result FROM allostasis_allocator_messages WHERE message_key = ? OR idempotency_key = ?')
      .all(messageKey(message, 'messageId'), messageKey(message, 'idempotencyKey'));
    if (rows.some((row) => row.fingerprint !== digest(message))) throw new Error('ALLOSTASIS message idempotency conflict.');
    return rows.length ? JSON.parse(rows[0].result) : null;
  }

  record(message, result) {
    this.raw.prepare('INSERT INTO allostasis_allocator_messages (message_key,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)')
      .run(messageKey(message, 'messageId'), messageKey(message, 'idempotencyKey'), digest(message), JSON.stringify(message), JSON.stringify(result));
  }

  enqueue(query, message) {
    this.raw.prepare('INSERT INTO allostasis_grant_outbox (pool_key,message_key,message,fingerprint) VALUES (?,?,?,?)')
      .run(poolKey(query), messageKey(message, 'messageId'), JSON.stringify(message), digest(message));
  }

  outbox(query) {
    return this.raw.prepare('SELECT message,fingerprint FROM allostasis_grant_outbox WHERE pool_key = ? ORDER BY sequence').all(poolKey(query))
      .map((row) => { const message = JSON.parse(row.message);
        if (digest(message) !== row.fingerprint) throw new Error('ALLOSTASIS grant outbox integrity mismatch.');
        return message; });
  }

  close() { this.raw.close(); }
}

module.exports = { AllocatorStore, poolKey };
