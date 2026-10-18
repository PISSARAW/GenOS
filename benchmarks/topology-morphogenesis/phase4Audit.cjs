'use strict';

const { analyzeMission } = require('../../backend/src/services/aTeamService');
const { brierScore } = require('./calibration.cjs');
const { evaluateSelection } = require('./selection-evaluation.cjs');

const SOURCE_SPLITS = new Set(['training', 'historical']);

function overlap(training, holdout, field) {
  const known = new Set(training.map(row => row?.[field]).filter(Boolean));
  return [...new Set(holdout.map(row => row?.[field]).filter(value => known.has(value)))];
}

function validatePartition(training, holdout) {
  if (!Array.isArray(training) || !training.length) throw new Error('Phase 4 training partition is required.');
  if (!Array.isArray(holdout) || !holdout.length) throw new Error('Phase 4 holdout partition is required.');
  const reasons = ['taskId', 'taskFamily', 'oracleId'].flatMap(field => {
    const values = overlap(training, holdout, field);
    return values.length ? [`${field}_leakage:${values.join(',')}`] : [];
  });
  if (holdout.some(row => row?.selectorAccess !== false)) reasons.push('holdout_selector_access_not_revoked');
  if (reasons.length) throw new Error(`Phase 4 partition rejected: ${reasons.join(';')}`);
  return true;
}

function mapPredictions(predictions) {
  const list = Array.isArray(predictions) ? predictions : [];
  const map = new Map();
  for (const prediction of list) {
    if (!prediction?.taskId || map.has(prediction.taskId)) throw new Error('Phase 4 predictions must have unique task IDs.');
    if (!SOURCE_SPLITS.has(prediction.sourceSplit)) throw new Error(`Prediction ${prediction.taskId} has an invalid source split.`);
    if (Object.prototype.hasOwnProperty.call(prediction, 'oracleTopology')) {
      throw new Error(`Prediction ${prediction.taskId} contains an oracle topology.`);
    }
    map.set(prediction.taskId, prediction);
  }
  return map;
}

function evaluateConfidenceCalibration(input = {}) {
  const training = input.training || [];
  const holdout = input.holdout || [];
  validatePartition(training, holdout);
  const predictions = mapPredictions(input.predictions);
  const rows = holdout.map(record => {
    const prediction = predictions.get(record.taskId);
    if (!prediction) throw new Error(`Missing holdout confidence prediction for ${record.taskId}.`);
    if (record.oracleVerified !== true || typeof record.outcome !== 'boolean') {
      throw new Error(`Holdout outcome for ${record.taskId} is not externally verified.`);
    }
    return { taskId: record.taskId, confidence: prediction.confidence,
      outcome: record.outcome, abstained: prediction.abstain === true };
  });
  const scored = rows.filter(row => !row.abstained);
  const score = brierScore(scored.map(row => ({ confidence: row.confidence, outcome: row.outcome })));
  return { scope: 'holdout', count: rows.length, scoredCount: scored.length,
    coverage: scored.length / rows.length, abstentionRate: 1 - scored.length / rows.length,
    brierScore: score.score, status: 'observed' };
}

function baselineReport(holdout, baseline) {
  if (!Array.isArray(baseline) || baseline.length !== holdout.length) {
    throw new Error('Each Phase 4 baseline must cover every holdout task.');
  }
  const byTask = new Map(baseline.map(row => [row.taskId, row.topology]));
  const rows = holdout.map(record => {
    const topology = byTask.get(record.taskId);
    if (!topology || !Number.isFinite(record.outcomes?.[topology])) throw new Error(`Baseline is incomplete for ${record.taskId}.`);
    return { taskId: record.taskId, topology, score: record.outcomes[topology] };
  });
  return { meanUtility: rows.reduce((sum, row) => sum + row.score, 0) / rows.length, rows };
}

function evaluateSelectionAudit(input = {}) {
  const training = input.training || [];
  const holdout = input.holdout || [];
  validatePartition(training, holdout);
  const selectionPredictions = mapPredictions(input.predictions).size
    ? input.predictions.map(prediction => ({ taskId: prediction.taskId, topology: prediction.topology })) : [];
  const selection = evaluateSelection({ training, holdout, predictions: selectionPredictions });
  const baselines = Object.fromEntries(Object.entries(input.baselines || {}).map(([name, rows]) => [name, baselineReport(holdout, rows)]));
  if (!Object.keys(baselines).length) throw new Error('Phase 4 requires at least one selection baseline.');
  return { ...selection, baselines, sourcePolicy: 'training-or-historical-only', status: 'observed' };
}

function evaluateAteamAudit(cases) {
  if (!Array.isArray(cases) || cases.length < 3) throw new Error('A-Team audit requires at least three paraphrase pairs.');
  const reports = cases.map(testCase => {
    const keyworded = analyzeMission(testCase.keyworded).detectedDomains;
    const paraphrased = analyzeMission(testCase.paraphrased).detectedDomains;
    const expected = new Set(testCase.expectedDomains);
    const metrics = values => {
      const actual = new Set(values);
      const correct = [...actual].filter(domain => expected.has(domain)).length;
      return { precision: actual.size ? correct / actual.size : 0, recall: expected.size ? correct / expected.size : 0 };
    };
    const union = new Set([...keyworded, ...paraphrased]);
    const intersection = keyworded.filter(domain => paraphrased.includes(domain)).length;
    return { id: testCase.id, keyworded: metrics(keyworded), paraphrased: metrics(paraphrased),
      domainSetJaccard: union.size ? intersection / union.size : 1 };
  });
  const mean = field => reports.reduce((sum, row) => sum + field(row), 0) / reports.length;
  return { scope: 'lexical-sensitivity', status: 'exploratory', caseCount: reports.length,
    meanParaphrasePrecision: mean(row => row.paraphrased.precision),
    meanParaphraseRecall: mean(row => row.paraphrased.recall),
    meanDomainSetJaccard: mean(row => row.domainSetJaccard), reports };
}

function runPhase4Audit(input = {}) {
  const calibration = evaluateConfidenceCalibration(input);
  const selection = evaluateSelectionAudit(input);
  const ateam = evaluateAteamAudit(input.ateamCases);
  return { schema: 'genos.morphogenesis.phase4-audit/v1', status: 'observed', calibration, selection, ateam,
    universalSuperiority: false, confirmationEligible: false };
}

module.exports = { validatePartition, evaluateConfidenceCalibration, evaluateSelectionAudit,
  evaluateAteamAudit, runPhase4Audit };
