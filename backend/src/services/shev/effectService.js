'use strict';

const { getResponsibility } = require('./responsibilityService');

function validInput(input) {
  return input?.projectId && input.initiativeId && input.postObservationId
    && typeof input.verify === 'function';
}

function comparable(after, before) {
  return after && after.dimension === before.dimension && after.kind === 'state'
    && after.epistemic_status === 'observed'
    && Date.parse(after.observed_at) > Date.parse(before.observed_at)
    && (!after.valid_until || Date.parse(after.valid_until) > Date.now());
}

function validAssessment(assessment) {
  return assessment && ['confirmed', 'regressed', 'inconclusive'].includes(assessment.result)
    && typeof assessment.verifierRef === 'string' && Boolean(assessment.verifierRef.trim())
    && Array.isArray(assessment.evidenceRefs) && assessment.evidenceRefs.length > 0;
}

async function effectContext(db, input) {
  const row = await db.get(`SELECT * FROM shev_initiatives WHERE id = ? AND project_id = ?`,
    [input.initiativeId, input.projectId]);
  if (!row || row.status !== 'queued' || !row.task_id) throw new Error('SHEV initiative was not queued.');
  const before = await db.get(`SELECT * FROM shev_observations WHERE project_id = ? AND id = ?`,
    [input.projectId, row.observation_id]);
  const task = await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [row.task_id]);
  if (task?.status !== 'done') throw new Error('SHEV task is not complete.');
  const after = await db.get(`SELECT * FROM shev_observations WHERE project_id = ? AND id = ?`,
    [input.projectId, input.postObservationId]);
  if (!comparable(after, before)) throw new Error('SHEV post-action observation is missing or incomparable.');
  return { row, before, after };
}

async function recordProjectEffect(db, input) {
  if (!validInput(input)) throw new TypeError('SHEV effect requires an external verifier.');
  const existing = await db.get('SELECT * FROM shev_effects WHERE initiative_id = ?', [input.initiativeId]);
  if (existing) {
    if (existing.post_observation_id !== input.postObservationId) throw new Error('SHEV effect idempotency conflict.');
    return { ...existing, replayed: true };
  }
  const { row, before, after } = await effectContext(db, input);
  const responsibility = await getResponsibility(db, input.projectId);
  const dimension = responsibility.mandate.dimensions.find((item) => item.name === before.dimension);
  const assessment = await input.verify({ before, after, dimension });
  if (!validAssessment(assessment)) {
    throw new Error('SHEV effect verifier did not return a supported assessment.');
  }
  await db.run(`INSERT OR IGNORE INTO shev_effects
    (initiative_id, post_observation_id, project_result, agent_result, verifier_ref, evidence_json)
    VALUES (?, ?, ?, 'not_tested', ?, ?)`, [input.initiativeId, input.postObservationId,
    assessment.result, assessment.verifierRef, JSON.stringify(assessment.evidenceRefs)]);
  const stored = await db.get('SELECT * FROM shev_effects WHERE initiative_id = ?', [input.initiativeId]);
  if (stored.post_observation_id !== input.postObservationId) throw new Error('SHEV effect idempotency conflict.');
  return stored;
}

module.exports = { recordProjectEffect };
