'use strict';

const crypto = require('node:crypto');
const calibration = require('./morphogenesisNosologyCalibration');

const MAX_OUTCOMES = 4096;
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS morphogenesis_nosology_projection_outcomes (
  observation_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  organization_id TEXT,
  project_id TEXT,
  observation_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS morphogenesis_nosology_projection_scope_idx
  ON morphogenesis_nosology_projection_outcomes(organization_id, project_id, mission_id);
CREATE TRIGGER IF NOT EXISTS morphogenesis_nosology_projection_no_update
  BEFORE UPDATE ON morphogenesis_nosology_projection_outcomes
  BEGIN SELECT RAISE(ABORT, 'nosology projection outcomes are append-only'); END;
CREATE TRIGGER IF NOT EXISTS morphogenesis_nosology_projection_no_delete
  BEFORE DELETE ON morphogenesis_nosology_projection_outcomes
  BEGIN SELECT RAISE(ABORT, 'nosology projection outcomes are append-only'); END;`;

function invalid(reason) {
  return Object.assign(new Error(`Invalid nosology projection outcome: ${reason}.`), {
    code: 'NOSOLOGY_PROJECTION_OUTCOME_INVALID'
  });
}

function optionalId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim()) throw invalid('scope');
  return value.trim();
}

function normalizedScope(input = {}) {
  if (typeof input.missionId !== 'string' || !input.missionId.trim()) throw invalid('mission_id');
  return { missionId: input.missionId.trim(), organizationId: optionalId(input.organizationId),
    projectId: optionalId(input.projectId) };
}

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

async function ensure(db) {
  if (!db || typeof db.exec !== 'function') throw invalid('database');
  await db.exec(TABLE_SQL);
}

async function record(db, scopeInput, observation) {
  const scope = normalizedScope(scopeInput);
  if (!calibration.verifiedRow(observation)) throw invalid('independent_receipt');
  const json = JSON.stringify(observation);
  const payloadHash = hash(json);
  await ensure(db);
  const inserted = await db.run(`INSERT OR IGNORE INTO morphogenesis_nosology_projection_outcomes
    (observation_id, mission_id, organization_id, project_id, observation_json, payload_hash)
    VALUES (?, ?, ?, ?, ?, ?)`, observation.id, scope.missionId,
  scope.organizationId, scope.projectId, json, payloadHash);
  const saved = await db.get(`SELECT mission_id, organization_id, project_id, payload_hash
    FROM morphogenesis_nosology_projection_outcomes WHERE observation_id = ?`, observation.id);
  if (saved.mission_id !== scope.missionId || saved.organization_id !== scope.organizationId
    || saved.project_id !== scope.projectId || saved.payload_hash !== payloadHash) {
    throw Object.assign(new Error('Nosology projection outcome conflicts with persisted evidence.'), {
      code: 'NOSOLOGY_PROJECTION_OUTCOME_CONFLICT'
    });
  }
  return { recorded: inserted.changes === 1, observationId: observation.id };
}

function scopeQuery(scope) {
  const shared = scope.organizationId || scope.projectId;
  const where = shared ? 'organization_id IS ? AND project_id IS ?'
    : 'organization_id IS NULL AND project_id IS NULL AND mission_id = ?';
  return { where, values: shared ? [scope.organizationId, scope.projectId] : [scope.missionId] };
}

async function load(db, scopeInput) {
  if (!db || typeof db.exec !== 'function' || typeof db.all !== 'function') return [];
  const scope = normalizedScope(scopeInput);
  const limit = Number.isSafeInteger(scopeInput.limit)
    ? Math.min(MAX_OUTCOMES, Math.max(1, scopeInput.limit)) : MAX_OUTCOMES;
  await ensure(db);
  const query = scopeQuery(scope);
  const rows = await db.all(`SELECT observation_json, payload_hash
    FROM morphogenesis_nosology_projection_outcomes WHERE ${query.where}
    ORDER BY rowid DESC LIMIT ?`, ...query.values, limit);
  return rows.flatMap((stored) => {
    if (hash(stored.observation_json) !== stored.payload_hash) return [];
    try {
      const observation = JSON.parse(stored.observation_json);
      return calibration.verifiedRow(observation) ? [observation] : [];
    } catch (_) { return []; }
  });
}

async function loadForContinuation(input, dependencies) {
  if (typeof dependencies.loadNosologyProjectionOutcomes !== 'function') return [];
  const mission = input.state.normalizedMission || {};
  try {
    const rows = await dependencies.loadNosologyProjectionOutcomes({
      missionId: mission.missionId || input.orchestratorId, limit: MAX_OUTCOMES
    });
    return Array.isArray(rows) && rows.length <= MAX_OUTCOMES ? rows : [];
  } catch (_) { return []; }
}

module.exports = { MAX_OUTCOMES, ensure, record, load, loadForContinuation };
