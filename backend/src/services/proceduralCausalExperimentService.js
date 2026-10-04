'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const CHECKPOINT_STATES = new Set(['running', 'paused']);

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
  serialize(value);
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function ensureSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS procedural_causal_experiments (
    experiment_id TEXT PRIMARY KEY, protocol_version TEXT NOT NULL,
    snapshot_refs_json TEXT NOT NULL, snapshot_hashes_json TEXT NOT NULL,
    snapshot_states_json TEXT NOT NULL DEFAULT '{}', arms_json TEXT NOT NULL DEFAULT '{}',
    seeds_json TEXT NOT NULL DEFAULT '[]', runner_hash TEXT,
    environment_manifest_json TEXT NOT NULL DEFAULT '{}',
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
    lease_token TEXT, lease_until TEXT,
    error_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(experiment_id, snapshot_id, arm, seed),
    FOREIGN KEY(experiment_id) REFERENCES procedural_causal_experiments(experiment_id)
  );
  CREATE TABLE IF NOT EXISTS procedural_causal_fork_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, fork_id TEXT NOT NULL,
    event_type TEXT NOT NULL, state_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
    previous_hash TEXT, event_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(fork_id) REFERENCES procedural_causal_forks(fork_id)
  );
  CREATE INDEX IF NOT EXISTS idx_causal_forks_status ON procedural_causal_forks(experiment_id, status);`);
  await ensureColumns(db, 'procedural_causal_experiments', {
    snapshot_states_json: "TEXT NOT NULL DEFAULT '{}'", arms_json: "TEXT NOT NULL DEFAULT '{}'",
    seeds_json: "TEXT NOT NULL DEFAULT '[]'", runner_hash: 'TEXT',
    environment_manifest_json: "TEXT NOT NULL DEFAULT '{}'",
  });
  await ensureColumns(db, 'procedural_causal_forks', { lease_token: 'TEXT', lease_until: 'TEXT' });
  await ensureColumns(db, 'procedural_causal_fork_events', { previous_hash: 'TEXT', event_hash: 'TEXT' });
}

async function ensureColumns(db, table, columns) {
  const existing = new Set((await db.all(`PRAGMA table_info(${table})`)).map((column) => column.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function serialize(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch (_) { throw new Error('Causal inputs must be JSON serializable.'); }
  if (encoded === undefined || !isDeepStrictEqual(JSON.parse(encoded), value)) {
    throw new Error('Causal inputs must be losslessly JSON serializable.');
  }
  return encoded;
}

function validateExperiment(spec) {
  for (const field of ['runnerId', 'environmentId', 'protocolVersion']) {
    if (typeof spec[field] !== 'string' || !spec[field].trim()) throw new Error(`${field} is required.`);
  }
  if (!Array.isArray(spec.snapshots) || !spec.snapshots.length) throw new Error('At least one snapshot is required.');
  const ids = spec.snapshots.map((item) => item?.snapshotId);
  if (ids.some((value) => typeof value !== 'string' || !value.trim()) || new Set(ids).size !== ids.length) {
    throw new Error('Snapshot identities must be non-empty and distinct.');
  }
  if (!spec.arms?.control || !spec.arms?.intervention) throw new Error('Both causal arms are required.');
  if (!Array.isArray(spec.seeds) || !spec.seeds.length || spec.seeds.some((seed) => !Number.isSafeInteger(seed))
    || new Set(spec.seeds).size !== spec.seeds.length) throw new Error('Distinct integer seeds are required.');
  if (!Number.isSafeInteger(spec.budget?.maxSteps) || spec.budget.maxSteps < 1
    || !Number.isSafeInteger(spec.budget?.maxRuns) || spec.budget.maxRuns < spec.snapshots.length * spec.seeds.length * 2
    || !spec.analysis || !spec.environmentManifest) throw new Error('Budget, analysis and environment declarations are required.');
}

async function createExperiment(db, spec) {
  validateExperiment(spec);
  await ensureSchema(db);
  const experimentId = spec.experimentId || id('causal_exp');
  const snapshotHashes = Object.fromEntries(spec.snapshots.map((item) => [item.snapshotId, digest(item.state)]));
  const snapshotStates = Object.fromEntries(spec.snapshots.map((item) => [item.snapshotId, item.state]));
  const environmentHash = digest(spec.environmentManifest);
  await db.run(`INSERT INTO procedural_causal_experiments
    (experiment_id, protocol_version, snapshot_refs_json, snapshot_hashes_json,
     snapshot_states_json, arms_json, seeds_json, runner_hash, environment_manifest_json,
     runner_id, environment_id, environment_hash, budget_json, analysis_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [
    experimentId, spec.protocolVersion, serialize(spec.snapshots.map(({ snapshotId }) => snapshotId)),
    serialize(snapshotHashes), serialize(snapshotStates), serialize(spec.arms), serialize(spec.seeds),
    spec.runnerHash || null, serialize(spec.environmentManifest), spec.runnerId, spec.environmentId, environmentHash,
    serialize(spec.budget), serialize(spec.analysis),
  ]);
  return { experimentId, snapshotHashes, environmentHash, status: 'pending' };
}

async function recordEvent(db, event) {
  const previous = await db.get('SELECT event_hash FROM procedural_causal_fork_events WHERE fork_id = ? ORDER BY sequence DESC LIMIT 1', [event.forkId]);
  const previousHash = previous?.event_hash || null;
  const payload = event.payload || {};
  const eventHash = digest({ forkId: event.forkId, eventType: event.eventType,
    stateHash: event.stateHash, payload, previousHash });
  await db.run(`INSERT INTO procedural_causal_fork_events
    (fork_id, event_type, state_hash, payload_json, previous_hash, event_hash) VALUES (?, ?, ?, ?, ?, ?)`,
  [event.forkId, event.eventType, event.stateHash, serialize(payload), previousHash, eventHash]);
  return eventHash;
}

async function transaction(db, action) {
  await db.exec('BEGIN IMMEDIATE');
  try {
    const result = await action();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function createFork(db, input) {
  await ensureSchema(db);
  const experiment = await db.get('SELECT * FROM procedural_causal_experiments WHERE experiment_id = ?', [input.experimentId]);
  if (!experiment) throw new Error(`Unknown causal experiment '${input.experimentId}'.`);
  const hashes = JSON.parse(experiment.snapshot_hashes_json);
  const states = JSON.parse(experiment.snapshot_states_json);
  const seeds = JSON.parse(experiment.seeds_json);
  const snapshotState = input.snapshotState === undefined ? states[input.snapshotId] : input.snapshotState;
  if (hashes[input.snapshotId] !== digest(snapshotState)) throw new Error('CAUSAL_SNAPSHOT_MISMATCH');
  if (!['control', 'intervention'].includes(input.arm)) throw new Error('Unknown causal fork arm.');
  if (!seeds.includes(input.seed)) throw new Error('Fork seed is not declared by the experiment.');
  const forkId = id('causal_fork');
  const forkHash = digest(snapshotState);
  const stateJson = serialize(snapshotState);
  await transaction(db, async () => {
    await db.run(`INSERT INTO procedural_causal_forks
      (fork_id, experiment_id, snapshot_id, snapshot_hash, arm, seed, state_json, state_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [
      forkId, input.experimentId, input.snapshotId, forkHash, input.arm, input.seed, stateJson, forkHash,
    ]);
    await recordEvent(db, { forkId, eventType: 'FORK_CREATED', stateHash: forkHash,
      payload: { snapshotId: input.snapshotId, arm: input.arm, seed: input.seed } });
  });
  return { forkId, experimentId: input.experimentId, snapshotId: input.snapshotId, snapshotHash: forkHash, arm: input.arm, seed: input.seed, status: 'pending' };
}

async function checkpointFork(db, input) {
  await ensureSchema(db);
  if (!CHECKPOINT_STATES.has(input.status)) throw new Error('Invalid causal checkpoint state.');
  const row = await db.get('SELECT * FROM procedural_causal_forks WHERE fork_id = ?', [input.forkId]);
  if (!row) throw new Error(`Unknown causal fork '${input.forkId}'.`);
  if (input.expectedVersion !== row.checkpoint_version) throw new Error('CAUSAL_CHECKPOINT_CONFLICT');
  if (row.status !== 'running' || !input.leaseToken || input.leaseToken !== row.lease_token) {
    throw new Error('CAUSAL_FORK_LEASE_CONFLICT');
  }
  const stateHash = digest(input.state);
  await transaction(db, async () => {
    const updated = await db.run(`UPDATE procedural_causal_forks
      SET state_json = ?, state_hash = ?, status = ?, checkpoint_version = checkpoint_version + 1,
          error_json = ?, updated_at = datetime('now'), lease_until = datetime('now', '+60 seconds')
      WHERE fork_id = ? AND checkpoint_version = ? AND lease_token = ? AND status = 'running'`, [
      serialize(input.state), stateHash, input.status, input.error ? serialize(input.error) : null,
      input.forkId, input.expectedVersion, input.leaseToken,
    ]);
    if (updated.changes !== 1) throw new Error('CAUSAL_CHECKPOINT_CONFLICT');
    await recordEvent(db, { forkId: input.forkId, eventType: 'CHECKPOINT', stateHash,
      payload: { status: input.status, version: input.expectedVersion + 1 } });
  });
  return { forkId: input.forkId, stateHash, status: input.status, checkpointVersion: input.expectedVersion + 1 };
}

async function loadFork(db, forkId) {
  await ensureSchema(db);
  const fork = await db.get('SELECT * FROM procedural_causal_forks WHERE fork_id = ?', [forkId]);
  if (!fork) return null;
  const state = JSON.parse(fork.state_json);
  if (digest(state) !== fork.state_hash) throw new Error('CAUSAL_FORK_STATE_CORRUPT');
  const events = await db.all('SELECT * FROM procedural_causal_fork_events WHERE fork_id = ? ORDER BY sequence', [forkId]);
  const verifiedEvents = verifyEvents(forkId, events);
  return { ...fork, state, events: verifiedEvents };
}

function verifyEvents(forkId, events) {
  let previousHash = null;
  return events.map((event) => {
    const payload = JSON.parse(event.payload_json);
    if (event.event_hash) {
      const expected = digest({ forkId, eventType: event.event_type, stateHash: event.state_hash,
        payload, previousHash });
      if (event.previous_hash !== previousHash || event.event_hash !== expected) {
        throw new Error('CAUSAL_FORK_EVENT_CORRUPT');
      }
    } else if (previousHash) throw new Error('CAUSAL_FORK_EVENT_CORRUPT');
    previousHash = event.event_hash || null;
    return { ...event, payload };
  });
}

async function loadExperiment(db, experimentId) {
  await ensureSchema(db);
  return db.get('SELECT * FROM procedural_causal_experiments WHERE experiment_id = ?', [experimentId]);
}

module.exports = { ensureSchema, digest, transaction, recordEvent, createExperiment, createFork,
  checkpointFork, loadFork, loadExperiment };
