'use strict';

const crypto = require('node:crypto');

const FORK_STATES = new Set(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Causal inputs must be JSON serializable.');
  return encoded;
}

function digest(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function ensureSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS procedural_causal_experiments (
    experiment_id TEXT PRIMARY KEY, protocol_version TEXT NOT NULL,
    snapshot_refs_json TEXT NOT NULL, snapshot_hashes_json TEXT NOT NULL,
    runner_id TEXT NOT NULL, environment_id TEXT NOT NULL,
    environment_hash TEXT NOT NULL, budget_json TEXT NOT NULL,
    analysis_json TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS procedural_causal_forks (
    fork_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
    arm TEXT NOT NULL, seed INTEGER NOT NULL, state_json TEXT NOT NULL,
    state_hash TEXT NOT NULL, status TEXT NOT NULL,
    checkpoint_version INTEGER NOT NULL DEFAULT 0,
    error_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(experiment_id, snapshot_id, arm, seed),
    FOREIGN KEY(experiment_id) REFERENCES procedural_causal_experiments(experiment_id)
  );
  CREATE TABLE IF NOT EXISTS procedural_causal_fork_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, fork_id TEXT NOT NULL,
    event_type TEXT NOT NULL, state_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(fork_id) REFERENCES procedural_causal_forks(fork_id)
  );
  CREATE INDEX IF NOT EXISTS idx_causal_forks_status ON procedural_causal_forks(experiment_id, status);`);
}

function serialize(value) {
  canonical(value);
  return JSON.stringify(value);
}

function validateExperiment(spec) {
  for (const field of ['runnerId', 'environmentId', 'protocolVersion']) {
    if (typeof spec[field] !== 'string' || !spec[field].trim()) throw new Error(`${field} is required.`);
  }
  if (!Array.isArray(spec.snapshots) || !spec.snapshots.length) throw new Error('At least one snapshot is required.');
  if (!spec.budget || !spec.analysis) throw new Error('Budget and analysis declarations are required.');
}

async function createExperiment(db, spec) {
  validateExperiment(spec);
  await ensureSchema(db);
  const experimentId = spec.experimentId || id('causal_exp');
  const snapshotHashes = Object.fromEntries(spec.snapshots.map((item) => [item.snapshotId, digest(item.state)]));
  const environmentHash = digest(spec.environmentManifest);
  await db.run(`INSERT INTO procedural_causal_experiments
    (experiment_id, protocol_version, snapshot_refs_json, snapshot_hashes_json,
     runner_id, environment_id, environment_hash, budget_json, analysis_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [
    experimentId, spec.protocolVersion, serialize(spec.snapshots.map(({ snapshotId }) => snapshotId)),
    serialize(snapshotHashes), spec.runnerId, spec.environmentId, environmentHash,
    serialize(spec.budget), serialize(spec.analysis),
  ]);
  return { experimentId, snapshotHashes, environmentHash, status: 'pending' };
}

async function recordEvent(db, event) {
  await db.run(`INSERT INTO procedural_causal_fork_events
    (fork_id, event_type, state_hash, payload_json) VALUES (?, ?, ?, ?)`,
  [event.forkId, event.eventType, event.stateHash, serialize(event.payload || {})]);
}

async function createFork(db, input) {
  await ensureSchema(db);
  const experiment = await db.get('SELECT * FROM procedural_causal_experiments WHERE experiment_id = ?', [input.experimentId]);
  if (!experiment) throw new Error(`Unknown causal experiment '${input.experimentId}'.`);
  const hashes = JSON.parse(experiment.snapshot_hashes_json);
  if (hashes[input.snapshotId] !== digest(input.snapshotState)) throw new Error('CAUSAL_SNAPSHOT_MISMATCH');
  if (!['control', 'intervention', 'parent', 'candidate'].includes(input.arm)) throw new Error('Unknown causal fork arm.');
  if (!Number.isSafeInteger(input.seed)) throw new Error('Fork seed must be a safe integer.');
  const forkId = id('causal_fork');
  const forkHash = digest(input.snapshotState);
  const stateJson = serialize(input.snapshotState);
  await db.run(`INSERT INTO procedural_causal_forks
    (fork_id, experiment_id, snapshot_id, snapshot_hash, arm, seed, state_json, state_hash, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [
    forkId, input.experimentId, input.snapshotId, forkHash, input.arm, input.seed, stateJson, forkHash,
  ]);
  await recordEvent(db, { forkId, eventType: 'FORK_CREATED', stateHash: forkHash, payload: { snapshotId: input.snapshotId, arm: input.arm, seed: input.seed } });
  return { forkId, experimentId: input.experimentId, snapshotId: input.snapshotId, snapshotHash: forkHash, arm: input.arm, seed: input.seed, status: 'pending' };
}

async function checkpointFork(db, input) {
  await ensureSchema(db);
  if (!FORK_STATES.has(input.status)) throw new Error('Invalid causal fork state.');
  const row = await db.get('SELECT * FROM procedural_causal_forks WHERE fork_id = ?', [input.forkId]);
  if (!row) throw new Error(`Unknown causal fork '${input.forkId}'.`);
  if (input.expectedVersion !== row.checkpoint_version) throw new Error('CAUSAL_CHECKPOINT_CONFLICT');
  if (input.expectedVersion === 0 && digest(input.state) !== row.snapshot_hash) throw new Error('CAUSAL_SNAPSHOT_MISMATCH');
  const stateHash = digest(input.state);
  const updated = await db.run(`UPDATE procedural_causal_forks
    SET state_json = ?, state_hash = ?, status = ?, checkpoint_version = checkpoint_version + 1,
        error_json = ?, updated_at = datetime('now')
    WHERE fork_id = ? AND checkpoint_version = ?`, [
    serialize(input.state), stateHash, input.status, input.error ? serialize(input.error) : null,
    input.forkId, input.expectedVersion,
  ]);
  if (updated.changes !== 1) throw new Error('CAUSAL_CHECKPOINT_CONFLICT');
  await recordEvent(db, { forkId: input.forkId, eventType: 'CHECKPOINT', stateHash, payload: { status: input.status, version: input.expectedVersion + 1 } });
  return { forkId: input.forkId, stateHash, status: input.status, checkpointVersion: input.expectedVersion + 1 };
}

async function loadFork(db, forkId) {
  await ensureSchema(db);
  const fork = await db.get('SELECT * FROM procedural_causal_forks WHERE fork_id = ?', [forkId]);
  if (!fork) return null;
  const state = JSON.parse(fork.state_json);
  if (digest(state) !== fork.state_hash) throw new Error('CAUSAL_FORK_STATE_CORRUPT');
  const events = await db.all('SELECT * FROM procedural_causal_fork_events WHERE fork_id = ? ORDER BY sequence', [forkId]);
  return { ...fork, state, events: events.map((event) => ({ ...event, payload: JSON.parse(event.payload_json) })) };
}

module.exports = { ensureSchema, digest, createExperiment, createFork, checkpointFork, loadFork };
