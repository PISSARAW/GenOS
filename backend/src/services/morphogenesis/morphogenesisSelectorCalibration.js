'use strict';

const crypto = require('node:crypto');
const evidenceAudit = require('../trinityEvidenceAudit');
const receiptService = require('../epistemicVerifierReceiptService');
const verifierTrust = require('../verifierTrustRegistry');
const pairedEvidence = require('./morphogenesisPairedOutcomeEvidence');

const MIN_TRAIN = 30;
const MIN_VALIDATION = 10;
const MIN_COVERAGE_FAMILIES = 2;
const MIN_COVERAGE_MODELS = 2;
const SCALE = Object.freeze(['COMMUNICATION_REDUCTION', 'RESOURCE_REALLOCATION', 'ROSTER_REDUCTION',
  'EARLY_STOP', 'COHORT_REPLACEMENT']);

function digest(row) {
  const body = Object.fromEntries(['id', 'scale', 'taskFamily', 'modelId', 'split',
    'candidateId', 'predictedGain', 'actualGain', 'predictedCost', 'actualCost']
    .map(key => [key, row[key]]));
  if (row.pairEvidence) {
    body.taskId = row.taskId;
    body.pairEvidence = row.pairEvidence;
  }
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
}

function validIdentity(row) {
  return row && ['id', 'candidateId', 'taskFamily', 'modelId'].every(key =>
    typeof row[key] === 'string' && row[key].trim().length > 0)
    && SCALE.includes(row.scale) && ['train', 'validation'].includes(row.split);
}

function validMetrics(row) {
  return [row.predictedGain, row.actualGain]
    .every(value => Number.isFinite(value) && value >= -1 && value <= 1)
    && [row.predictedCost, row.actualCost]
      .every(value => Number.isFinite(value) && value >= 0 && value <= 1);
}

function validReceipt(row) {
  const receipt = row.receipt;
  return evidenceAudit.isVerifiedReceipt(receipt) && receipt.resultId === row.id
    && receipt.evidenceDigest === digest(row)
    && receiptService.validateReceipt(receipt, verifierTrust.listVerifierDigests());
}

function verifiedRow(row) {
  return validIdentity(row) && validMetrics(row) && validReceipt(row)
    && row.pairEvidence && pairedEvidence.validPairedEvidence(row)
    && pairedEvidence.validFinalReceipt(row);
}

function means(rows) {
  return ['actualGain', 'actualCost'].map(key => rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
}

function error(rows, key, prediction) {
  return rows.reduce((sum, row) => sum + Math.abs(row[key] - prediction(row)), 0) / rows.length;
}

function dispersion(rows, key, mean) {
  const variance = rows.reduce((sum, row) => sum + (row[key] - mean) ** 2, 0) / rows.length;
  return Math.sqrt(variance / rows.length);
}

function disjoint(train, validation, key) {
  const trained = new Set(train.map(row => row[key]));
  return validation.every(row => !trained.has(row[key]));
}

function calibrateCandidate(rows, scale, candidateId) {
  const sameCandidate = rows.filter(row => row.scale === scale && row.candidateId === candidateId);
  const train = sameCandidate.filter(row => row.split === 'train');
  const validation = sameCandidate.filter(row => row.split === 'validation');
  if (train.length < MIN_TRAIN || validation.length < MIN_VALIDATION
    || !disjoint(train, validation, 'taskFamily') || !disjoint(train, validation, 'modelId')
    || !disjointPairedTasks(train, validation)) {
    return unavailable('insufficient_independent_holdout');
  }
  const [gain, cost] = means(train);
  const gainMae = error(validation, 'actualGain', row => row.predictedGain);
  const gainBaselineMae = error(validation, 'actualGain', () => 0);
  const costMae = error(validation, 'actualCost', row => row.predictedCost);
  const costBaselineMae = error(validation, 'actualCost', () => 0);
  if (gainMae >= gainBaselineMae || costMae >= costBaselineMae) return unavailable('heldout_error_not_better_than_prior');
  const validationGain = meanActual(validation, 'actualGain');
  const validationCost = meanActual(validation, 'actualCost');
  if (!(validationGain > 0)) return unavailable('heldout_gain_not_positive');
  const se = dispersion(validation, 'actualGain', validationGain);
  return { status: 'calibrated', sampleSize: train.length, validationSize: validation.length,
    taskFamilyHoldout: true, modelHoldout: true, expectedGain: gain, validationGain,
    validationCost,
    gainUncertainty: Math.min(1, 1.96 * se), marginalCost: cost,
    costUncertainty: Math.min(1, 1.96 * dispersion(validation, 'actualCost', meanActual(validation, 'actualCost'))),
    heldoutMae: { gain: gainMae, gainPrior: gainBaselineMae, cost: costMae, costPrior: costBaselineMae } };
}

function disjointPairedTasks(train, validation) {
  const paired = [...train, ...validation].filter(row => row.pairEvidence);
  if (!paired.length) return true;
  if (paired.length !== train.length + validation.length) return false;
  return disjoint(train, validation, 'taskId');
}

function meanActual(rows, key) {
  return rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
}

function unavailable(reason) {
  return { status: 'unavailable', reason, expectedGain: null, gainUncertainty: null,
    validationGain: null, validationCost: null, marginalCost: null, costUncertainty: null };
}

function validationRows(rows, scale, candidateId) {
  return rows.filter(row => row.scale === scale && row.candidateId === candidateId
    && row.split === 'validation' && typeof row.taskId === 'string' && row.taskId.trim());
}

function candidateEntries(rows, calibration) {
  return SCALE.flatMap(scale => Object.entries(calibration.scales[scale].candidates)
    .filter(([, estimate]) => estimate.status === 'calibrated')
    .map(([candidateId, estimate]) => ({ scale, candidateId, estimate,
      rows: validationRows(rows, scale, candidateId) })));
}

function coverageSummary(entries) {
  const candidates = entries.map(entry => {
    const taskFamilies = [...new Set(entry.rows.map(row => row.taskFamily).filter(Boolean))];
    const modelIds = [...new Set(entry.rows.map(row => row.modelId).filter(Boolean))];
    return { scale: entry.scale, candidateId: entry.candidateId,
      validationTasks: new Set(entry.rows.map(row => row.taskId)).size,
      taskFamilies, modelIds,
      crossFamily: taskFamilies.length >= MIN_COVERAGE_FAMILIES,
      crossModel: modelIds.length >= MIN_COVERAGE_MODELS };
  });
  const crossFamily = candidates.length > 0 && candidates.every(item => item.crossFamily);
  const crossModel = candidates.length > 0 && candidates.every(item => item.crossModel);
  return { status: crossFamily && crossModel ? 'cross_family_model_observed' : 'limited_observed_domain',
    externalValidity: 'unproven',
    claim: 'no_universal_superiority_claim',
    requirements: { taskFamilies: MIN_COVERAGE_FAMILIES, modelIds: MIN_COVERAGE_MODELS },
    candidates, crossFamily, crossModel };
}

function comparativePair(left, right) {
  const rightByTask = new Map(right.rows.map(row => [row.taskId, row]));
  const differences = left.rows.flatMap(row => {
    const counterpart = rightByTask.get(row.taskId);
    return counterpart ? [row.actualGain - counterpart.actualGain] : [];
  });
  if (differences.length < MIN_VALIDATION) {
    return { status: 'unavailable', reason: 'insufficient_common_validation_tasks',
      commonValidationTasks: differences.length };
  }
  const mean = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const variance = differences.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / differences.length;
  const uncertainty = Math.min(2, 1.96 * Math.sqrt(variance / differences.length));
  return { status: 'measured', commonValidationTasks: differences.length,
    meanGainDifference: Number(mean.toFixed(6)), uncertainty: Number(uncertainty.toFixed(6)),
    lowerBound: Number((mean - uncertainty).toFixed(6)) };
}

function compareGlobalSuperiority(rows, calibration) {
  const entries = candidateEntries(rows, calibration);
  const coverage = coverageSummary(entries);
  if (entries.length < 2) return { status: 'insufficient_baselines', candidateCount: entries.length,
    reason: 'at_least_two_calibrated_candidates_required', pairwise: [], coverage };
  const pairwise = [];
  for (let index = 0; index < entries.length; index += 1) {
    for (let next = index + 1; next < entries.length; next += 1) {
      const left = entries[index];
      const right = entries[next];
      pairwise.push({ left: { scale: left.scale, candidateId: left.candidateId },
        right: { scale: right.scale, candidateId: right.candidateId },
        comparison: comparativePair(left, right) });
    }
  }
  if (pairwise.some(item => item.comparison.status !== 'measured')) {
    return { status: 'insufficient_paired_holdout', candidateCount: entries.length, pairwise,
      reason: 'all_candidates_need_common_validation_tasks', coverage };
  }
  const winners = entries.filter(candidate => entries.filter(item => item !== candidate)
    .every(other => comparativePair(candidate, other).lowerBound > 0));
  if (winners.length !== 1) return { status: 'inconclusive', candidateCount: entries.length,
    pairwise, reason: 'no_unique_candidate_clears_all_pairwise_lower_bounds', coverage };
  return { status: 'qualified', candidateCount: entries.length, pairwise,
    winner: { scale: winners[0].scale, candidateId: winners[0].candidateId },
    coverage,
    claim: 'global_superiority_supported_only_for_the_observed_common_holdout' };
}

function compileCalibration(samples) {
  const supplied = Array.isArray(samples) ? samples : [];
  const rows = supplied.filter(verifiedRow);
  const invalidCount = supplied.length - rows.length;
  const duplicateIds = new Set(rows.map(row => row.id)).size !== rows.length;
  const scales = Object.fromEntries(SCALE.map(scale => [scale,
    { status: 'unavailable', reason: 'no_verified_samples', candidates: {} }]));
  if (duplicateIds) return { status: 'invalid', reason: 'duplicate_sample_ids', scales };
  for (const scale of SCALE) {
    const ids = [...new Set(rows.filter(row => row.scale === scale).map(row => row.candidateId))];
    for (const id of ids) scales[scale].candidates[id] = calibrateCandidate(rows, scale, id);
    const qualified = Object.values(scales[scale].candidates).some(item => item.status === 'calibrated');
    scales[scale].status = qualified ? 'calibrated' : 'unavailable';
    if (ids.length) scales[scale].reason = qualified ? null : 'no_candidate_has_qualified_heldout_evidence';
  }
  const calibrated = Object.values(scales).some(item => item.status === 'calibrated');
  const result = { status: calibrated ? 'calibrated' : 'unavailable', verifiedSampleCount: rows.length,
    rejectedSampleCount: invalidCount, scales };
  result.comparative = compareGlobalSuperiority(rows, result);
  return result;
}

function selectScale(calibration, availableCandidates) {
  const candidates = (availableCandidates || []).filter(item => SCALE.includes(item.scale))
    .map(item => ({ ...item, ...calibration?.scales?.[item.scale]?.candidates?.[item.candidateId] }))
    .filter(item => item.status === 'calibrated')
    .filter(item => {
      const heldoutGain = Number.isFinite(item.validationGain) ? item.validationGain : item.expectedGain;
      return heldoutGain - item.gainUncertainty > item.marginalCost + item.costUncertainty;
    })
    .sort((a, b) => {
      const heldoutA = Number.isFinite(a.validationGain) ? a.validationGain : a.expectedGain;
      const heldoutB = Number.isFinite(b.validationGain) ? b.validationGain : b.expectedGain;
      return (heldoutB - b.gainUncertainty - b.marginalCost - b.costUncertainty)
        - (heldoutA - a.gainUncertainty - a.marginalCost - a.costUncertainty);
    });
  if (!candidates.length) return { scale: 'NO_CHANGE', reason: 'verified_gain_does_not_clear_uncertainty_and_marginal_cost',
    comparativeStatus: calibration?.comparative?.status || 'not_evaluated' };
  return { scale: candidates[0].scale, candidateId: candidates[0].candidateId,
    reason: 'verified_heldout_gain_clears_uncertainty_and_marginal_cost',
    estimate: candidates[0], comparativeStatus: calibration?.comparative?.status || 'not_evaluated',
    comparativeClaim: calibration?.comparative?.status === 'qualified'
      ? 'global_superiority_supported_only_for_the_observed_common_holdout'
      : 'global_superiority_unproven' };
}

function candidateRows(rows, scale, candidateId) {
  return rows.filter(row => row.scale === scale && row.candidateId === candidateId);
}

function candidateDeficit(rows, scale, candidateId) {
  const same = candidateRows(rows, scale, candidateId);
  const train = same.filter(row => row.split === 'train');
  const validation = same.filter(row => row.split === 'validation');
  const detail = calibrateCandidate(rows, scale, candidateId);
  return { candidateId, scale, train: train.length, validation: validation.length,
    needsTrain: Math.max(0, MIN_TRAIN - train.length),
    needsValidation: Math.max(0, MIN_VALIDATION - validation.length),
    taskFamilyHoldout: disjoint(train, validation, 'taskFamily'),
    modelHoldout: disjoint(train, validation, 'modelId'),
    pairedTasksDisjoint: disjointPairedTasks(train, validation),
    status: detail.status, reason: detail.status === 'calibrated' ? null : detail.reason };
}

function scaleDeficit(rows, scale) {
  const ids = [...new Set(rows.filter(row => row.scale === scale).map(row => row.candidateId))];
  const candidates = Object.fromEntries(ids.map(id => [id, candidateDeficit(rows, scale, id)]));
  const qualified = Object.values(candidates).some(item => item.status === 'calibrated');
  return { status: qualified ? 'calibrated' : 'unavailable', candidates };
}

function describeCorpusDeficit(samples) {
  const rows = (Array.isArray(samples) ? samples : []).filter(verifiedRow);
  const scales = Object.fromEntries(SCALE.map(scale => [scale, scaleDeficit(rows, scale)]));
  const calibrated = Object.values(scales).some(item => item.status === 'calibrated');
  const comparative = compareGlobalSuperiority(rows, compileCalibration(rows));
  return { status: calibrated ? 'calibrated' : 'unavailable',
    verifiedSampleCount: rows.length, requiredTrain: MIN_TRAIN,
    requiredValidation: MIN_VALIDATION, scales, comparative };
}

module.exports = { SCALE, compileCalibration, selectScale, digest, verifiedRow, describeCorpusDeficit,
  compareGlobalSuperiority, coverageSummary };
