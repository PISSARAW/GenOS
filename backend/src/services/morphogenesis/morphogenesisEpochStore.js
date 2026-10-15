'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../../db');

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS morphogenesis_epoch_checkpoints (
  mission_id TEXT PRIMARY KEY,
  organization_id TEXT,
  project_id TEXT,
  epoch INTEGER NOT NULL CHECK (epoch >= 0),
  phase TEXT NOT NULL,
  state_json TEXT NOT NULL,
  results_json TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  barrier_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS morphogenesis_epoch_scope_idx
  ON morphogenesis_epoch_checkpoints(organization_id, project_id, mission_id);
CREATE TABLE IF NOT EXISTS morphogenesis_epoch_checkpoint_events (
  idempotency_key TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  organization_id TEXT,
  project_id TEXT,
  revision INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  checkpoint_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`;

async function ensure(db) {
  await db.exec(TABLE_SQL);
}

async function saveCheckpoint(db, checkpoint) {
  const candidate = validateCheckpoint(checkpoint);
  await ensure(db);
  return withTransaction(db, async () => {
    const prior = await findEvent(db, candidate.idempotencyKey);
    if (prior) return replayOrReject(prior, candidate);
    const owner = await db.get('SELECT organization_id, project_id FROM morphogenesis_epoch_checkpoints WHERE mission_id=?', candidate.missionId);
    if (owner && (owner.organization_id !== candidate.organizationId || owner.project_id !== candidate.projectId)) {
      throw Object.assign(new Error('Morphogenesis mission checkpoint belongs to a different scope.'), {
        code: 'MORPHOGENESIS_CHECKPOINT_SCOPE_CONFLICT'
      });
    }
    const current = await findScoped(db, candidate);
    assertExpectedRevision(candidate, current);
    const revision = (current?.revision || 0) + 1;
    const snapshot = snapshotFrom(candidate, revision);
    await insertSnapshot(db, candidate, snapshot);
    await insertEvent(db, candidate, snapshot);
    return snapshot;
  });
}

async function loadCheckpoint(db, scope) {
  const candidate = validateScope(scope);
  await ensure(db);
  const row = await findScoped(db, candidate);
  return row ? decodeSnapshot(row) : null;
}

async function listCheckpoints(db, input = {}) {
  await ensure(db);
  const limit = Number.isSafeInteger(input.limit) ? Math.min(100, Math.max(1, input.limit)) : 32;
  const phases = Array.isArray(input.phases) ? input.phases.filter((phase) => typeof phase === 'string') : [];
  if (!phases.length) return { checkpoints: [], truncated: false };
  const placeholders = phases.map(() => '?').join(', ');
  const continuationEpochs = input.includeContinuationEpochs === true;
  const recoveryFilter = continuationEpochs ? "AND (phase != 'collecting' OR epoch > 0)" : '';
  const priorityOrder = continuationEpochs ? "CASE phase WHEN 'advancing' THEN 0 ELSE 1 END, " : '';
  const rows = await db.all(`SELECT * FROM morphogenesis_epoch_checkpoints
    WHERE phase IN (${placeholders}) ${recoveryFilter}
    ORDER BY ${priorityOrder}updated_at ASC, mission_id ASC LIMIT ?`, ...phases, limit + 1);
  const checkpoints = (rows || []).slice(0, limit).map(decodeSnapshot);
  return { checkpoints, truncated: (rows || []).length > limit };
}

function validateCheckpoint(input) {
  const scope = validateScope(input);
  validateCounter(input.epoch, 'epoch');
  validateCounter(input.expectedRevision, 'expectedRevision');
  const phase = validateText(input.phase, 'phase');
  const idempotencyKey = validateText(input.idempotencyKey, 'idempotencyKey');
  return { ...scope, epoch: input.epoch, phase, idempotencyKey,
    expectedRevision: input.expectedRevision, state: input.state ?? {}, results: input.results ?? [],
    budget: input.budget ?? {}, barrier: input.barrier ?? {} };
}

function validateCounter(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid(field);
}

function validateText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw invalid(field);
  return value.trim();
}

function validateScope(input) {
  if (!input || typeof input.missionId !== 'string' || !input.missionId.trim()) throw invalid('missionId');
  return { missionId: input.missionId.trim(), organizationId: normalizeScope(input.organizationId),
    projectId: normalizeScope(input.projectId) };
}

function normalizeScope(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid('scope');
  return value;
}

function invalid(field) {
  return Object.assign(new Error(`Invalid morphogenesis checkpoint ${field}.`), { code: 'MORPHOGENESIS_CHECKPOINT_INVALID' });
}

function assertExpectedRevision(candidate, current) {
  if ((current?.revision || 0) !== candidate.expectedRevision) {
    throw Object.assign(new Error('Morphogenesis checkpoint revision changed.'), {
      code: 'MORPHOGENESIS_CHECKPOINT_REVISION_CONFLICT', currentRevision: current?.revision || 0
    });
  }
}

function snapshotFrom(candidate, revision) {
  const fields = { missionId: candidate.missionId, organizationId: candidate.organizationId,
    projectId: candidate.projectId, epoch: candidate.epoch, phase: candidate.phase,
    state: candidate.state, results: candidate.results, budget: candidate.budget, barrier: candidate.barrier,
    revision, idempotencyKey: candidate.idempotencyKey };
  return { ...fields, payloadHash: hash(fields) };
}

async function findEvent(db, key) {
  return db.get('SELECT * FROM morphogenesis_epoch_checkpoint_events WHERE idempotency_key=?', key);
}

async function findScoped(db, scope) {
  return db.get(`SELECT * FROM morphogenesis_epoch_checkpoints WHERE mission_id=?
    AND organization_id IS ? AND project_id IS ?`, scope.missionId, scope.organizationId, scope.projectId);
}

async function insertSnapshot(db, candidate, snapshot) {
  await db.run(`INSERT INTO morphogenesis_epoch_checkpoints
    (mission_id, organization_id, project_id, epoch, phase, state_json, results_json, budget_json,
     barrier_json, revision, idempotency_key, payload_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(mission_id) DO UPDATE SET organization_id=excluded.organization_id,
      project_id=excluded.project_id, epoch=excluded.epoch, phase=excluded.phase,
      state_json=excluded.state_json, results_json=excluded.results_json, budget_json=excluded.budget_json,
      barrier_json=excluded.barrier_json, revision=excluded.revision,
      idempotency_key=excluded.idempotency_key, payload_hash=excluded.payload_hash, updated_at=datetime('now')`,
  candidate.missionId, candidate.organizationId, candidate.projectId, candidate.epoch, candidate.phase,
  json(candidate.state), json(candidate.results), json(candidate.budget), json(candidate.barrier),
  snapshot.revision, candidate.idempotencyKey, snapshot.payloadHash);
}

async function insertEvent(db, candidate, snapshot) {
  await db.run(`INSERT INTO morphogenesis_epoch_checkpoint_events
    (idempotency_key, mission_id, organization_id, project_id, revision, payload_hash, checkpoint_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, candidate.idempotencyKey, candidate.missionId,
  candidate.organizationId, candidate.projectId, snapshot.revision, snapshot.payloadHash, json(snapshot));
}

function replayOrReject(event, candidate) {
  const saved = JSON.parse(event.checkpoint_json);
  const identityMatches = event.mission_id === candidate.missionId
    && event.organization_id === candidate.organizationId && event.project_id === candidate.projectId;
  const proposed = snapshotFrom(candidate, event.revision);
  if (!identityMatches || proposed.payloadHash !== event.payload_hash) {
    throw Object.assign(new Error('Morphogenesis checkpoint idempotency key conflicts with persisted data.'), {
      code: 'MORPHOGENESIS_CHECKPOINT_IDEMPOTENCY_CONFLICT'
    });
  }
  return saved;
}

function decodeSnapshot(row) {
  const snapshot = { missionId: row.mission_id, organizationId: row.organization_id,
    projectId: row.project_id, epoch: row.epoch, phase: row.phase, state: JSON.parse(row.state_json),
    results: JSON.parse(row.results_json), budget: JSON.parse(row.budget_json),
    barrier: JSON.parse(row.barrier_json), revision: row.revision,
    idempotencyKey: row.idempotency_key, payloadHash: row.payload_hash };
  const { payloadHash, ...fields } = snapshot;
  if (hash(fields) !== payloadHash) {
    throw Object.assign(new Error('Persisted morphogenesis checkpoint integrity check failed.'), {
      code: 'MORPHOGENESIS_CHECKPOINT_INTEGRITY_MISMATCH'
    });
  }
  return snapshot;
}

function json(value) {
  try { return JSON.stringify(value); } catch { throw invalid('json'); }
}

function hash(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

module.exports = { ensure, saveCheckpoint, loadCheckpoint, listCheckpoints };
