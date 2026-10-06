'use strict';

const { createHash } = require('node:crypto');

function score(value) { return Number.isInteger(value) && value >= 0 && value <= 4; }

function validReference(item) {
  return item && typeof item.id === 'string' && item.id.trim()
    && score(item.referenceScore) && score(item.evaluatorScore)
    && typeof item.evidenceRef === 'string' && item.evidenceRef.trim();
}

function calibrationId(input) {
  return `shev_cal_${createHash('sha256').update(JSON.stringify([
    input.projectId, input.evaluatorId, input.rubricVersion, input.references
  ])).digest('hex')}`;
}

function validCalibrationInput(input) {
  return input?.projectId && input.evaluatorId && input.rubricVersion
    && Array.isArray(input.references) && input.references.length >= 3 && input.references.length <= 20
    && input.references.every(validReference)
    && new Set(input.references.map((item) => item.id)).size === input.references.length
    && typeof input.verifyReferences === 'function';
}

function validReferenceReceipt(receipt, input) {
  return receipt?.verified === true && receipt.verifierRef
    && receipt.verifierRef !== input.evaluatorId && Array.isArray(receipt.evidenceRefs)
    && receipt.evidenceRefs.length >= 3;
}

async function calibrateEvaluator(db, input) {
  if (!validCalibrationInput(input)) {
    throw new TypeError('SHEV qualitative calibration requires three independent reference cases.');
  }
  const receipt = await input.verifyReferences(input.references);
  if (!validReferenceReceipt(receipt, input)) throw new Error('SHEV reference cases lack independent verification.');
  const error = input.references.reduce((sum, item) =>
    sum + Math.abs(item.referenceScore - item.evaluatorScore), 0) / input.references.length;
  const id = calibrationId(input);
  const evidence = { references: input.references, verifierRef: receipt.verifierRef,
    evidenceRefs: receipt.evidenceRefs };
  await db.run(`INSERT OR IGNORE INTO shev_qualitative_calibrations
    (id, project_id, evaluator_id, rubric_version, mean_absolute_error, reference_json)
    VALUES (?, ?, ?, ?, ?, ?)`, [id, input.projectId, input.evaluatorId,
    input.rubricVersion, error, JSON.stringify(evidence)]);
  return db.get('SELECT * FROM shev_qualitative_calibrations WHERE id = ?', [id]);
}

function validJudgmentEvidence(input) {
  return Array.isArray(input.evidenceRefs) && input.evidenceRefs.length > 0
    && input.evidenceRefs.length <= 20
    && input.evidenceRefs.every((ref) => typeof ref === 'string' && ref.length <= 512);
}

function validJudgmentText(input) {
  return typeof input.id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(input.id)
    && typeof input.audience === 'string' && input.audience.trim() && input.audience.length <= 256
    && typeof input.rationale === 'string' && input.rationale.trim() && input.rationale.length <= 2048;
}

function validJudgment(input, calibration, observation) {
  return calibration && observation && observation.epistemic_status === 'observed'
    && score(input.score) && validJudgmentText(input) && validJudgmentEvidence(input);
}

async function recordQualitativeJudgment(db, input) {
  const calibration = await db.get(`SELECT * FROM shev_qualitative_calibrations
    WHERE id = ? AND project_id = ? AND evaluator_id = ?`,
  [input.calibrationId, input.projectId, input.evaluatorId]);
  const observation = await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, input.observationId]);
  if (!validJudgment(input, calibration, observation)) {
    throw new Error('SHEV qualitative judgment lacks calibration, observation or evidence.');
  }
  await db.run(`INSERT OR IGNORE INTO shev_qualitative_judgments
    (id, project_id, observation_id, calibration_id, evaluator_id, audience, score, rationale, evidence_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [input.id, input.projectId, input.observationId,
    input.calibrationId, input.evaluatorId, input.audience, input.score,
    input.rationale, JSON.stringify(input.evidenceRefs)]);
  const row = await db.get('SELECT * FROM shev_qualitative_judgments WHERE id = ?', [input.id]);
  if (row.project_id !== input.projectId || row.observation_id !== input.observationId
    || row.calibration_id !== input.calibrationId || row.evaluator_id !== input.evaluatorId
    || row.score !== input.score || row.audience !== input.audience || row.rationale !== input.rationale
    || row.evidence_json !== JSON.stringify(input.evidenceRefs)) {
    throw new Error('SHEV qualitative judgment idempotency conflict.');
  }
  return row;
}

async function qualitativeDisagreement(db, input) {
  const rows = await db.all(`SELECT j.*, c.mean_absolute_error, c.rubric_version
    FROM shev_qualitative_judgments j JOIN shev_qualitative_calibrations c
      ON c.id = j.calibration_id WHERE j.project_id = ? AND j.observation_id = ?
    ORDER BY j.created_at, j.id`, [input.projectId, input.observationId]);
  const eligible = rows.filter((row) => row.mean_absolute_error <= 0.75
    && row.rubric_version === input.rubricVersion && (!input.audience || row.audience === input.audience));
  const calibrated = [...new Map(eligible.map(row => [row.evaluator_id, row])).values()];
  const mixedAudiences = new Set(eligible.map(row => row.audience)).size > 1;
  const values = eligible.map((row) => row.score);
  const spread = values.length ? Math.max(...values) - Math.min(...values) : null;
  return { judgments: rows, calibratedCount: calibrated.length, spread, mixedAudiences,
    disputed: calibrated.length < 2 || spread >= 2 || mixedAudiences };
}

module.exports = { calibrateEvaluator, recordQualitativeJudgment, qualitativeDisagreement };
