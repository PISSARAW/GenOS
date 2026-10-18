'use strict';

const crypto = require('node:crypto');
const evidenceAudit = require('../trinityEvidenceAudit');
const projection = require('./morphogenesisNosologyProjection');

const SCHEMA = 'genos.nosology-projection-campaign/v1';
const CANDIDATE = 'condition_noisy_or_v2';
const CONTROLS = Object.freeze(['family_max_v1', 'raw_signals', 'no_change']);
const MIN_CASES = 20;
const MIN_TASK_FAMILIES = 3;
const MIN_MODELS = 2;
const MIN_DOMAINS = 3;

function digest(row) {
  const fields = ['id', 'caseId', 'mode', 'taskFamily', 'modelId', 'evaluationDomain',
    'datasetDigest', 'quality', 'cost', 'holdout'];
  const body = Object.fromEntries(fields.map((key) => [key, row[key]]));
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
}

function validIdentity(row) {
  return row && ['id', 'caseId', 'taskFamily', 'modelId', 'evaluationDomain']
    .every((key) => typeof row[key] === 'string' && row[key].trim())
    && projection.MODES.includes(row.mode) && row.holdout === true
    && /^sha256:[0-9a-f]{64}$/i.test(row.datasetDigest || '');
}

function validMeasurement(row) {
  return [row.quality, row.cost].every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

function verifiedRow(row) {
  return validIdentity(row) && validMeasurement(row)
    && evidenceAudit.isVerifiedReceipt(row.receipt)
    && row.receipt.resultId === row.id && row.receipt.evidenceDigest === digest(row);
}

function commonContract(rows) {
  const values = rows.map((row) => [row.taskFamily, row.modelId, row.evaluationDomain,
    row.datasetDigest].join('\u0000'));
  return new Set(values).size === 1;
}

function completeCases(rows) {
  const grouped = new Map();
  for (const row of rows) grouped.set(row.caseId, [...(grouped.get(row.caseId) || []), row]);
  return [...grouped.values()].filter((items) => items.length === projection.MODES.length
    && new Set(items.map((item) => item.mode)).size === projection.MODES.length
    && commonContract(items));
}

function coverage(cases) {
  const rows = cases.flat();
  const taskFamilies = new Set(rows.map((row) => row.taskFamily));
  const models = new Set(rows.map((row) => row.modelId));
  const domains = new Set(rows.map((row) => row.evaluationDomain));
  const reasons = [];
  if (taskFamilies.size < MIN_TASK_FAMILIES) reasons.push('task_family_coverage_insufficient');
  if (models.size < MIN_MODELS) reasons.push('model_coverage_insufficient');
  if (domains.size < MIN_DOMAINS) reasons.push('evaluation_domain_coverage_insufficient');
  return { ready: reasons.length === 0, reasons, taskFamilyCount: taskFamilies.size,
    modelCount: models.size, evaluationDomainCount: domains.size };
}

function utility(row) { return row.quality - row.cost; }

function pairedComparison(cases, control, comparisons) {
  const differences = cases.map((rows) => {
    const candidate = rows.find((row) => row.mode === CANDIDATE);
    const baseline = rows.find((row) => row.mode === control);
    return utility(candidate) - utility(baseline);
  });
  const mean = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const variance = differences.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / differences.length;
  const uncertainty = 1.96 * Math.sqrt(comparisons) * Math.sqrt(variance / differences.length);
  return { control, commonCaseCount: differences.length,
    meanUtilityDifference: Number(mean.toFixed(6)), uncertainty: Number(uncertainty.toFixed(6)),
    lowerBound: Number((mean - uncertainty).toFixed(6)),
    multiplicityCorrection: 'bonferroni_conservative_sqrt_m' };
}

function compileCalibration(samples = []) {
  const supplied = Array.isArray(samples) ? samples : [];
  const verified = supplied.filter(verifiedRow);
  const cases = completeCases(verified);
  const domainCoverage = coverage(cases);
  const base = { schema: SCHEMA, status: 'unavailable', suppliedObservationCount: supplied.length,
    verifiedObservationCount: verified.length, commonHoldoutCaseCount: cases.length,
    requiredCommonCases: MIN_CASES, coverage: domainCoverage, comparisons: [],
    recommendedMode: 'family_max_v1', promotionAuthorized: false };
  if (new Set(verified.map((row) => row.id)).size !== verified.length) {
    return { ...base, reason: 'duplicate_observation_ids' };
  }
  if (cases.length < MIN_CASES) return { ...base, reason: 'insufficient_common_verified_holdout' };
  if (!domainCoverage.ready) return { ...base, reason: 'insufficient_coverage' };
  const comparisons = CONTROLS.map((control) => pairedComparison(cases, control, CONTROLS.length));
  const qualified = comparisons.every((item) => item.lowerBound > 0);
  return { ...base, status: qualified ? 'qualified' : 'inconclusive',
    reason: qualified ? null : 'candidate_does_not_beat_all_controls', comparisons,
    recommendedMode: qualified ? CANDIDATE : 'family_max_v1',
    claim: qualified ? 'candidate_superior_on_this_verified_common_holdout_only'
      : 'no_projection_superiority_demonstrated' };
}

function selectMode(calibration, requestedMode) {
  if (requestedMode === 'no_change') return { mode: 'no_change', reason: 'explicit_safe_abstention' };
  if (requestedMode === 'raw_signals') return { mode: 'raw_signals', reason: 'explicit_raw_signal_control' };
  if (requestedMode === CANDIDATE && calibration?.status === 'qualified') {
    return { mode: CANDIDATE, reason: 'explicitly_selected_after_verified_holdout_qualification' };
  }
  return { mode: 'family_max_v1', reason: requestedMode === CANDIDATE
    ? 'candidate_not_qualified' : 'production_reference_preserved' };
}

module.exports = { SCHEMA, CANDIDATE, CONTROLS, MIN_CASES, digest, verifiedRow,
  compileCalibration, selectMode };
