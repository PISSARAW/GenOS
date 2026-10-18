'use strict';

const crypto = require('node:crypto');
const calibration = require('./morphogenesisSelectorCalibration');

const MAX_OUTCOMES = 8192;
const TRAIN_PER_CANDIDATE = 40;
const VALIDATION_PER_CANDIDATE = 20;
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS morphogenesis_verified_outcomes (
  outcome_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  organization_id TEXT,
  project_id TEXT,
  outcome_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS morphogenesis_verified_outcomes_scope_idx
  ON morphogenesis_verified_outcomes(organization_id, project_id, mission_id);
CREATE TRIGGER IF NOT EXISTS morphogenesis_verified_outcomes_no_update
  BEFORE UPDATE ON morphogenesis_verified_outcomes
  BEGIN SELECT RAISE(ABORT, 'verified outcomes are append-only'); END;
CREATE TRIGGER IF NOT EXISTS morphogenesis_verified_outcomes_no_delete
  BEFORE DELETE ON morphogenesis_verified_outcomes
  BEGIN SELECT RAISE(ABORT, 'verified outcomes are append-only'); END;`;

function normalizedScope(input = {}) {
  if (typeof input.missionId !== 'string' || !input.missionId.trim()) throw invalid('mission_id');
  return { missionId: input.missionId.trim(),
    organizationId: optionalId(input.organizationId), projectId: optionalId(input.projectId) };
}

function optionalId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim()) throw invalid('scope');
  return value.trim();
}

function invalid(reason) {
  return Object.assign(new Error(`Invalid morphogenesis verified outcome: ${reason}.`), {
    code: 'MORPHOGENESIS_VERIFIED_OUTCOME_INVALID'
  });
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function ensure(db) {
  if (!db || typeof db.exec !== 'function') throw invalid('database');
  await db.exec(TABLE_SQL);
}

async function recordVerifiedOutcome(db, scopeInput, outcome) {
  const scope = normalizedScope(scopeInput);
  if (!calibration.verifiedRow(outcome)) throw invalid('independent_receipt');
  const json = JSON.stringify(outcome);
  const hash = digest(json);
  await ensure(db);
  const inserted = await db.run(`INSERT OR IGNORE INTO morphogenesis_verified_outcomes
    (outcome_id, mission_id, organization_id, project_id, outcome_json, payload_hash)
    VALUES (?, ?, ?, ?, ?, ?)`, outcome.id, scope.missionId,
  scope.organizationId, scope.projectId, json, hash);
  const saved = await db.get(`SELECT mission_id, organization_id, project_id, payload_hash
    FROM morphogenesis_verified_outcomes WHERE outcome_id = ?`, outcome.id);
  if (saved.mission_id !== scope.missionId || saved.organization_id !== scope.organizationId
    || saved.project_id !== scope.projectId || saved.payload_hash !== hash) {
    throw Object.assign(new Error('Verified outcome identity conflicts with persisted evidence.'), {
      code: 'MORPHOGENESIS_VERIFIED_OUTCOME_CONFLICT'
    });
  }
  return { recorded: inserted.changes === 1, outcomeId: outcome.id };
}

function scopedQuery(scope) {
  const shared = scope.organizationId || scope.projectId;
  const where = shared ? 'organization_id IS ? AND project_id IS ?'
    : 'organization_id IS NULL AND project_id IS NULL AND mission_id = ?';
  const values = shared ? [scope.organizationId, scope.projectId] : [scope.missionId];
  return { sql: `WITH ranked AS (
    SELECT outcome_json, payload_hash, rowid AS sequence,
      json_extract(outcome_json, '$.split') AS split,
      ROW_NUMBER() OVER (PARTITION BY json_extract(outcome_json, '$.candidateId'),
        json_extract(outcome_json, '$.split') ORDER BY rowid DESC) AS sample_rank
    FROM morphogenesis_verified_outcomes WHERE ${where} AND json_valid(outcome_json)
  ) SELECT outcome_json, payload_hash FROM ranked
    WHERE (split = 'train' AND sample_rank <= ?)
      OR (split = 'validation' AND sample_rank <= ?)
    ORDER BY sequence DESC LIMIT ?`, values };
}

async function loadVerifiedOutcomes(db, scopeInput) {
  if (!db || typeof db.exec !== 'function' || typeof db.all !== 'function') return [];
  const scope = normalizedScope(scopeInput);
  const limit = Number.isSafeInteger(scopeInput.limit)
    ? Math.min(MAX_OUTCOMES, Math.max(1, scopeInput.limit)) : MAX_OUTCOMES;
  await ensure(db);
  const query = scopedQuery(scope);
  const rows = await db.all(query.sql, ...query.values,
    TRAIN_PER_CANDIDATE, VALIDATION_PER_CANDIDATE, limit);
  return rows.flatMap((stored) => {
    if (digest(stored.outcome_json) !== stored.payload_hash) return [];
    try {
      const outcome = JSON.parse(stored.outcome_json);
      return calibration.verifiedRow(outcome) ? [outcome] : [];
    } catch (_) {
      return [];
    }
  });
}

async function loadVerifiedOutcome(db, scopeInput, outcomeId) {
  if (!db || typeof db.get !== 'function') return null;
  const scope = normalizedScope(scopeInput);
  await ensure(db);
  const stored = await db.get(`SELECT mission_id, organization_id, project_id,
    outcome_json, payload_hash FROM morphogenesis_verified_outcomes WHERE outcome_id = ?`, outcomeId);
  if (!stored || stored.mission_id !== scope.missionId
    || stored.organization_id !== scope.organizationId || stored.project_id !== scope.projectId
    || digest(stored.outcome_json) !== stored.payload_hash) return null;
  try {
    const outcome = JSON.parse(stored.outcome_json);
    return calibration.verifiedRow(outcome) ? outcome : null;
  } catch (_) {
    return null;
  }
}

module.exports = { MAX_OUTCOMES, ensure, recordVerifiedOutcome, loadVerifiedOutcome, loadVerifiedOutcomes };
