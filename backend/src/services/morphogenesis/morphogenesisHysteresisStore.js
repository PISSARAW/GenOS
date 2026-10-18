'use strict';

const { migrateMorphogenesisHysteresis } = require('../../db/migrations/migrateMorphogenesisHysteresis');

function scope(input) {
  const value = { organizationId: input.organizationId, projectId: input.projectId,
    missionId: input.missionId };
  if (Object.values(value).some(item => typeof item !== 'string' || !item.trim())) {
    throw Object.assign(new Error('A complete hysteresis scope is required.'), {
      code: 'MORPHOGENESIS_HYSTERESIS_SCOPE_REQUIRED' });
  }
  return value;
}

function stateFor(bound, row) {
  return { schema: 'genos.morphogenesis-hysteresis-state/v1', ...bound,
    version: Number(row?.version || 0), budgetLeft: Number(row?.budget_left ?? 1),
    lastCommitUnixMs: row ? Number(row.last_commit_unix_ms) : null };
}

async function calibrationPolicy(db, bound) {
  const outcomes = await require('./morphogenesisVerifiedOutcomeStore')
    .loadVerifiedOutcomes(db, bound);
  return require('./morphogenesisHysteresisCalibration').calibrate(outcomes);
}

async function load(db, input) {
  await migrateMorphogenesisHysteresis(db);
  const bound = scope(input);
  const row = await db.get(`SELECT version, budget_left, last_commit_unix_ms
    FROM morphogenesis_hysteresis WHERE organization_id=? AND project_id=? AND mission_id=?`,
  bound.organizationId, bound.projectId, bound.missionId);
  return { ...stateFor(bound, row), calibrationPolicy: await calibrationPolicy(db, bound) };
}

function validateTransition(input) {
  const transition = input.transition;
  const valid = transition?.schema === 'genos.morphogenesis-hysteresis-transition/v1'
    && Number.isSafeInteger(transition.baseVersion) && transition.baseVersion >= 0
    && Number.isSafeInteger(transition.nextVersion)
    && transition.nextVersion === transition.baseVersion + 1
    && Number.isFinite(transition.budgetLeft) && transition.budgetLeft >= 0
    && transition.budgetLeft <= 1;
  if (!valid) throw Object.assign(new Error('Rust hysteresis transition is invalid.'), {
    code: 'MORPHOGENESIS_HYSTERESIS_TRANSITION_INVALID' });
  return transition;
}

async function insertInitial(input) {
  return input.db.run(`INSERT OR IGNORE INTO morphogenesis_hysteresis
    (organization_id,project_id,mission_id,version,budget_left,last_commit_unix_ms,last_transition_id)
    VALUES (?,?,?,?,?,?,?)`, input.bound.organizationId, input.bound.projectId,
  input.bound.missionId, input.transition.nextVersion, input.transition.budgetLeft,
  input.committedAt, input.transitionId);
}

async function updateExisting(input) {
  return input.db.run(`UPDATE morphogenesis_hysteresis SET version=?, budget_left=?,
    last_commit_unix_ms=?, last_transition_id=?, updated_at=CURRENT_TIMESTAMP
    WHERE organization_id=? AND project_id=? AND mission_id=? AND version=?
      AND budget_left>=?`,
  input.transition.nextVersion, input.transition.budgetLeft, input.committedAt,
  input.transitionId, input.bound.organizationId, input.bound.projectId,
  input.bound.missionId, input.transition.baseVersion, input.transition.budgetLeft);
}

async function commit(input) {
  await migrateMorphogenesisHysteresis(input.db);
  const bound = scope(input);
  const transition = validateTransition(input);
  const committedAt = Number(input.committedAtUnixMs ?? Date.now());
  if (!Number.isSafeInteger(committedAt) || committedAt <= 0) {
    throw Object.assign(new Error('Commit time must be a positive Unix millisecond value.'), {
      code: 'MORPHOGENESIS_HYSTERESIS_TRANSITION_INVALID' });
  }
  const update = { ...input, bound, transition, committedAt };
  const result = transition.baseVersion === 0
    ? await insertInitial(update) : await updateExisting(update);
  if (result.changes !== 1) throw Object.assign(new Error('Hysteresis state changed after Rust authorization.'), {
    code: 'MORPHOGENESIS_HYSTERESIS_CONFLICT' });
  return stateFor(bound, { version: transition.nextVersion, budget_left: transition.budgetLeft,
    last_commit_unix_ms: committedAt });
}

module.exports = { load, commit };
