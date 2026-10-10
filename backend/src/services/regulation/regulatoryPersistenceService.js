'use strict';

const crypto = require('node:crypto');
const regulatory = require('./regulatoryStateService');
const bridge = require('./regulatoryBridgeService');

const digest = (content) => crypto.createHash('sha256').update(content).digest('hex');

async function ensureStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS regulatory_states (
    agent_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, CHECK (revision >= 0), CHECK (json_valid(state_json))
  );
  CREATE TABLE IF NOT EXISTS regulatory_checkpoints (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, revision INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL, digest TEXT NOT NULL, used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, CHECK (json_valid(snapshot_json))
  );
  CREATE TABLE IF NOT EXISTS regulatory_recoveries (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, checkpoint_id TEXT NOT NULL,
    recovery_agent_id TEXT NOT NULL, recovery_run_id TEXT NOT NULL,
    before_revision INTEGER NOT NULL, after_revision INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
}

async function load(db, agentId) {
  await ensureStorage(db);
  const row = await db.get('SELECT state_json FROM regulatory_states WHERE agent_id = ?', agentId);
  return row ? JSON.parse(row.state_json) : null;
}

async function save(db, agentId, state) {
  await ensureStorage(db);
  const current = await load(db, agentId);
  if (current && current.revision > state.revision) throw conflict();
  if (current && current.revision === state.revision) {
    if (JSON.stringify(current) !== JSON.stringify(state)) throw conflict();
    return state;
  }
  const saved = await db.run(`INSERT INTO regulatory_states (agent_id, revision, state_json)
    VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET revision=excluded.revision,
    state_json=excluded.state_json, updated_at=CURRENT_TIMESTAMP
    WHERE regulatory_states.revision < excluded.revision`, agentId, state.revision, JSON.stringify(state));
  if (saved.changes !== 1) throw conflict();
  return state;
}

function conflict() {
  return Object.assign(new Error('Regulatory state revision conflict.'), { code: 'REGULATORY_REVISION_CONFLICT' });
}

async function sync(db, agentId) {
  const persisted = await load(db, agentId);
  const local = regulatory.getState(agentId);
  if (persisted && persisted.revision >= local.revision) return regulatory.hydrateState(agentId, persisted);
  await save(db, agentId, local);
  return local;
}

async function checkpoint(db, agentId) {
  const state = await sync(db, agentId);
  const snapshot = bridge.toSnapshot(agentId);
  if (!bridge.validateSnapshot(snapshot).valid || !bridge.functional(snapshot)) {
    throw Object.assign(new Error('Only functional regulatory states can be checkpointed.'), { code: 'REGULATORY_CHECKPOINT_UNSAFE' });
  }
  const id = `regulatory_${crypto.randomUUID()}`;
  const content = JSON.stringify(snapshot);
  await db.run(`INSERT INTO regulatory_checkpoints (id, agent_id, revision, snapshot_json, digest)
    VALUES (?, ?, ?, ?, ?)`, id, agentId, state.revision, content, digest(content));
  return { id, agentId, revision: state.revision, content, digest: digest(content) };
}

async function getCheckpoint(db, agentId, id) {
  await ensureStorage(db);
  return db.get('SELECT * FROM regulatory_checkpoints WHERE id = ? AND agent_id = ? AND used_at IS NULL', id, agentId);
}

async function consume(db, input) {
  const result = await db.run(`UPDATE regulatory_checkpoints SET used_at=CURRENT_TIMESTAMP
    WHERE id=? AND agent_id=? AND used_at IS NULL`, input.checkpointId, input.agentId);
  if (result.changes !== 1) throw conflict();
  await save(db, input.agentId, input.after);
  await db.run(`INSERT INTO regulatory_recoveries
    (id, agent_id, checkpoint_id, recovery_agent_id, recovery_run_id, before_revision, after_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, crypto.randomUUID(), input.agentId, input.checkpointId,
    input.recoveryAgentId, input.recoveryRunId, input.before.revision, input.after.revision);
}

module.exports = { digest, sync, save, checkpoint, getCheckpoint, consume };
