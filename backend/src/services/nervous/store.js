'use strict';

const { SCHEMA } = require('./schema');
const { fingerprint, scopeOf, identifier } = require('./contract');

class NervousStore {
  constructor(db, options = {}) {
    if (typeof db?.exec !== 'function') throw new TypeError('A real transaction-capable connection is required');
    this.db = db;
    this.maxSignals = options.maxSignals ?? 100000;
    if (!Number.isSafeInteger(this.maxSignals) || this.maxSignals < 1) throw new TypeError('Invalid capacity');
    this.tail = Promise.resolve();
  }

  serial(operation) {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => {});
    return next;
  }

  async initialize() {
    await this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    await this.db.exec(SCHEMA);
    return this;
  }

  async transaction(operation) {
    await this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await operation();
      await this.db.exec('COMMIT');
      return result;
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }

  append(signal) {
    return this.serial(() => this.transaction(() => this.appendInside(signal)));
  }

  async appendInside(signal) {
    const existing = await this.db.get('SELECT fingerprint FROM nervous_signals WHERE id=?', signal.id);
    const hash = fingerprint(signal);
    if (existing) {
      if (existing.fingerprint !== hash) throw new Error('SIGNAL_ID_COLLISION');
      return false;
    }
    const count = await this.db.get('SELECT COUNT(*) AS count FROM nervous_signals');
    if (count.count >= this.maxSignals) throw new Error('NERVOUS_CAPACITY');
    await this.db.run(`INSERT INTO nervous_signals
      (id,organization_id,project_id,agent_id,fingerprint,body) VALUES(?,?,?,?,?,?)`,
    signal.id, signal.scope.organizationId, signal.scope.projectId, signal.agentId, hash, JSON.stringify(signal));
    return true;
  }

  next(reducer) {
    return this.serial(() => this.transaction(() => this.reduceInside(reducer)));
  }

  async reduceInside(reducer) {
    const row = await this.db.get('SELECT body FROM nervous_signals WHERE processed=0 ORDER BY sequence LIMIT 1');
    if (!row) return null;
    const signal = JSON.parse(row.body);
    const { organizationId, projectId } = signal.scope;
    const previous = await this.db.get(`SELECT body FROM nervous_states
      WHERE organization_id=? AND project_id=? AND agent_id=?`, organizationId, projectId, signal.agentId);
    const result = reducer(signal, previous ? JSON.parse(previous.body) : null);
    await this.saveResult(signal, result);
    return result.receipt;
  }

  async saveResult(signal, result) {
    const { organizationId, projectId } = signal.scope;
    await this.db.run(`INSERT INTO nervous_states VALUES(?,?,?,?)
      ON CONFLICT(organization_id,project_id,agent_id) DO UPDATE SET body=excluded.body`,
    organizationId, projectId, signal.agentId, JSON.stringify(result.state));
    await this.db.run('INSERT INTO nervous_receipts VALUES(?,?,?,?)',
      signal.id, organizationId, projectId, JSON.stringify(result.receipt));
    for (const effect of result.effects) {
      await this.db.run(`INSERT INTO nervous_effects
        (id,signal_id,organization_id,project_id,status,body) VALUES(?,?,?,?,?,?)`,
      effect.id, signal.id, organizationId, projectId, 'PROPOSED', JSON.stringify(effect));
    }
    await this.db.run('UPDATE nervous_signals SET processed=1 WHERE id=?', signal.id);
  }

  states(scope, options) {
    const s = scopeOf(scope);
    const agents = historyAgents(options?.agentIds);
    const clause = agents === undefined ? '' : ` AND agent_id IN (${agents.map(() => '?').join(',')})`;
    const limit = options === undefined ? '' : ' LIMIT ?';
    const params = [s.organizationId, s.projectId, ...(agents || [])];
    if (options !== undefined) params.push(stateLimit(options.limit));
    if (agents?.length === 0) return Promise.resolve([]);
    return this.serial(() => this.db.all(`SELECT agent_id,body FROM nervous_states
      WHERE organization_id=? AND project_id=?${clause} ORDER BY agent_id${limit}`, ...params));
  }

  history(scope, options = {}) {
    const s = scopeOf(scope);
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Invalid history limit');
    const agents = historyAgents(options.agentIds);
    const clause = agents === undefined ? '' : ` AND s.agent_id IN (${agents.map(() => '?').join(',')})`;
    const params = [s.organizationId, s.projectId, ...(agents || []), limit];
    if (agents?.length === 0) return Promise.resolve([]);
    return this.serial(async () => {
      const rows = await this.db.all(`SELECT s.body AS signal_body,r.body AS receipt_body
        FROM nervous_signals s JOIN nervous_receipts r ON r.signal_id=s.id
        AND r.organization_id=s.organization_id AND r.project_id=s.project_id
        WHERE s.organization_id=? AND s.project_id=?${clause}
        ORDER BY s.sequence DESC LIMIT ?`, ...params);
      return rows.map(row => ({ signal: JSON.parse(row.signal_body), receipt: JSON.parse(row.receipt_body) }));
    });
  }

  effects(scope) {
    const s = scopeOf(scope);
    return this.serial(() => this.db.all(`SELECT id,status,body,outcome FROM nervous_effects
      WHERE organization_id=? AND project_id=? ORDER BY rowid DESC LIMIT 100`, s.organizationId, s.projectId));
  }

  effect(id, scope) {
    const s = scopeOf(scope);
    return this.serial(() => this.db.get(`SELECT id,status,body,outcome FROM nervous_effects
      WHERE id=? AND organization_id=? AND project_id=?`, id, s.organizationId, s.projectId));
  }

  claim(id, scope) {
    const s = scopeOf(scope);
    return this.serial(() => this.db.get(`UPDATE nervous_effects SET status='CLAIMED'
      WHERE id=? AND organization_id=? AND project_id=? AND status='PROPOSED' RETURNING id`,
    id, s.organizationId, s.projectId));
  }

  finish(id, outcome) {
    return this.serial(() => this.db.run(`UPDATE nervous_effects SET status=?,outcome=?
      WHERE id=? AND status='CLAIMED'`, outcome.status, JSON.stringify(outcome), id));
  }

  receipt(id, scope) {
    const s = scopeOf(scope);
    return this.serial(() => this.db.get(`SELECT body FROM nervous_receipts
      WHERE signal_id=? AND organization_id=? AND project_id=?`, id, s.organizationId, s.projectId));
  }

  close() { return this.serial(() => this.db.close()); }
}

function historyAgents(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length > 128) throw new TypeError('Invalid agent selection');
  return [...new Set(input.map(id => identifier(id, 'agentId')))];
}

function stateLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 129) throw new TypeError('Invalid state limit');
  return limit;
}

module.exports = { NervousStore };
