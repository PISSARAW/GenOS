'use strict';

const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');
const { samePath } = require('./casSafety');
const { withTransaction } = require('../../db');

function worldKey(query) { return digest([query.scope, query.missionId, query.conversationId, query.worldId]); }
function messageKey(message) {
  return digest([message.scope, message.missionId, message.conversationId, message.sender, message.audience, message.idempotencyKey]);
}

class ExchangeStore {
  constructor(filename) {
    this.raw = new Database(filename);
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('busy_timeout = 5000');
    this.raw.exec(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, organization_id TEXT, project_id TEXT
    ); CREATE TABLE IF NOT EXISTS gqwf_exchange_worlds (world_key TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gqwf_exchange_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, message TEXT NOT NULL, result TEXT NOT NULL
    );`);
    this.db = { exec: async (sql) => this.raw.exec(sql),
      get: async (sql, ...parameters) => this.raw.prepare(sql).get(...parameters),
      all: async (sql, ...parameters) => this.raw.prepare(sql).all(...parameters),
      run: async (sql, ...parameters) => this.raw.prepare(sql).run(...parameters) };
  }

  state(query) {
    const row = this.raw.prepare('SELECT state FROM gqwf_exchange_worlds WHERE world_key = ?').get(worldKey(query));
    return row ? JSON.parse(row.state) : null;
  }

  replay(message) {
    const rows = this.raw.prepare('SELECT fingerprint,result FROM gqwf_exchange_events WHERE message_id = ? OR idempotency_key = ?')
      .all(message.messageId, messageKey(message));
    if (rows.some((row) => row.fingerprint !== digest(message))) throw new Error('GQWF Exchange message idempotency conflict.');
    return rows.length ? JSON.parse(rows[0].result) : null;
  }

  workspace(state, root) {
    this.raw.prepare('INSERT OR IGNORE INTO workspaces (id,path,organization_id,project_id) VALUES (?,?,?,?)')
      .run(state.world.workspaceId, root, state.query.scope.organizationId, state.query.scope.projectId);
    const row = this.raw.prepare('SELECT path,organization_id,project_id FROM workspaces WHERE id = ?').get(state.world.workspaceId);
    if (!samePath(row.path, root) || row.organization_id !== state.query.scope.organizationId || row.project_id !== state.query.scope.projectId) {
      throw new Error('GQWF Exchange logical workspace conflicts with trusted local registration.');
    }
  }

  index(state) {
    const world = state.world;
    this.raw.prepare('INSERT OR IGNORE INTO gqwf_roots (workspace_id,root_hash,manifest_json) VALUES (?,?,?)')
      .run(world.workspaceId, world.rootHash, world.manifestSerialized);
    this.raw.prepare(`INSERT OR IGNORE INTO gqwf_execution_closures
      (workspace_id,closure_hash,root_hash,manifest_json) VALUES (?,?,?,?)`)
      .run(world.workspaceId, world.closureHash, world.rootHash, world.closureSerialized);
    this.checkIndexes(state);
  }

  checkIndexes(state) {
    const world = state.world;
    const root = this.raw.prepare('SELECT manifest_json FROM gqwf_roots WHERE workspace_id = ? AND root_hash = ?')
      .get(world.workspaceId, world.rootHash);
    const closure = this.raw.prepare('SELECT root_hash,manifest_json FROM gqwf_execution_closures WHERE workspace_id = ? AND closure_hash = ?')
      .get(world.workspaceId, world.closureHash);
    if (root?.manifest_json !== world.manifestSerialized || closure?.root_hash !== world.rootHash || closure?.manifest_json !== world.closureSerialized) {
      throw new Error('GQWF Exchange native root or closure index mismatch.');
    }
  }

  async snapshot(query, message) {
    return withTransaction(this.db, async () => ({ expected: this.state(query), replay: this.replay(message) }));
  }

  async commit(change) {
    return withTransaction(this.db, async () => {
      await change.authorize();
      await change.revalidate();
      change.validate();
      const replay = this.replay(change.message);
      if (replay) return replay;
      if (digest(this.state(change.state.query)) !== digest(change.expected)) throw new Error('GQWF Exchange state changed concurrently; retry.');
      this.workspace(change.state, change.root);
      if (change.state.status === 'verified') this.index(change.state);
      this.raw.prepare('INSERT OR REPLACE INTO gqwf_exchange_worlds (world_key,state) VALUES (?,?)')
        .run(worldKey(change.state.query), JSON.stringify(change.state));
      this.raw.prepare(`INSERT INTO gqwf_exchange_events
        (message_id,idempotency_key,fingerprint,message,result) VALUES (?,?,?,?,?)`)
        .run(change.message.messageId, messageKey(change.message), digest(change.message), JSON.stringify(change.message), JSON.stringify(change.result));
      return change.result;
    });
  }

  history() {
    return this.raw.prepare('SELECT sequence,message,result FROM gqwf_exchange_events ORDER BY sequence').all()
      .map((row) => ({ sequence: row.sequence, message: JSON.parse(row.message), result: JSON.parse(row.result) }));
  }

  close() { this.raw.close(); }
}

module.exports = { ExchangeStore, worldKey };
