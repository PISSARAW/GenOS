'use strict';

const crypto = require('node:crypto');
const audit = require('./trinityEvidenceAudit');
const receipts = require('./epistemicVerifierReceiptService');
const trust = require('./verifierTrustRegistry');
const SIGNALS = ['hypothesisCount', 'domainUncertainty', 'errorCost', 'irreversibility', 'oracleAvailability', 'errorCorrelation', 'budgetRatio'];

function sigmoid(value) {
  return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, value))));
}

function features(row) {
  return [1, ...SIGNALS.map(key => row.signals?.[key])];
}

function validSample(row) {
  return typeof row.id === 'string' && row.sourceRefs?.length > 0 && verifiedSample(row)
    && features(row).every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    && (row.trinityBetter === 0 || row.trinityBetter === 1);
}

function predict(weights, vector) {
  return sigmoid(weights.reduce((sum, weight, index) => sum + weight * vector[index], 0));
}

function fit(rows) {
  const weights = Array(SIGNALS.length + 1).fill(0);
  for (let step = 0; step < 400; step += 1) {
    const gradient = Array(weights.length).fill(0);
    for (const row of rows) {
      const vector = features(row), error = predict(weights, vector) - row.trinityBetter;
      vector.forEach((value, index) => { gradient[index] += error * value; });
    }
    weights.forEach((weight, index) => { weights[index] = weight - 0.2 * (gradient[index] / rows.length + 0.01 * weight); });
  }
  return weights;
}

function calibrate(samples) {
  const rows = (samples || []).filter(validSample).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(rows.map(row => row.id)).size !== rows.length) return { status: 'invalid', reason: 'duplicate_sample_ids' };
  if (rows.length < 30) return { status: 'insufficient_data', sampleSize: rows.length, probability: null };
  const split = Math.floor(rows.length * 0.8), training = rows.slice(0, split), validation = rows.slice(split);
  if (new Set(training.map(row => row.trinityBetter)).size < 2) return { status: 'insufficient_data', reason: 'both_outcomes_required' };
  const weights = fit(training), prior = training.reduce((sum, row) => sum + row.trinityBetter, 0) / training.length;
  const brier = loss(validation, row => predict(weights, features(row)));
  const baselineBrier = loss(validation, () => prior);
  return sealModel({ status: brier < baselineBrier ? 'calibrated' : 'unqualified', weights, signals: SIGNALS,
    method: 'regularized_logistic_heldout_v1', trainingSize: training.length, validationSize: validation.length,
    brier, baselineBrier, sourceRefs: rows.flatMap(row => row.sourceRefs),
    corpusDigest: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') });
}

function modelDigest(model) {
  const { receipt, ...content } = model;
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
function sealModel(model) {
  const digest = modelDigest(model);
  return { ...model, receipt: receipts.issueReceipt({ resultId: 'trinity-model-' + model.corpusDigest, evidenceDigest: digest,
    verifierDigest: trust.getVerifier('benchmark').digest, independent: true,
    independenceDescriptor: { actorId: 'trinity-statistical-calibrator', workspaceId: 'trinity-heldout-validation' } }) };
}
function verifiedModel(model) {
  return audit.isVerifiedReceipt(model.receipt) && model.receipt.evidenceDigest === modelDigest(model)
    && receipts.validateReceipt(model.receipt, trust.listVerifierDigests());
}

function loss(rows, predictor) {
  return rows.reduce((sum, row) => sum + (predictor(row) - row.trinityBetter) ** 2, 0) / rows.length;
}

function evaluate(model, signals) {
  const vector = features({ signals });
  if (model?.status !== 'calibrated' || !verifiedModel(model) || !vector.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
  if (!Array.isArray(model.weights) || model.weights.length !== vector.length || !model.weights.every(Number.isFinite)) return null;
  return predict(model.weights, vector);
}

function errorCorrelation(samples) {
  const rows = (samples || []).filter(row => verifiedSample(row)
    && row.sourceRefs?.length && row.errors?.length === 3 && row.errors.every(value => value === 0 || value === 1));
  if (new Set(rows.map(row => row.id)).size !== rows.length) return { status: 'invalid', reason: 'duplicate_sample_ids', correlation: null };
  if (rows.length < 10) return { status: 'insufficient_data', sampleSize: rows.length, correlation: null };
  const values = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => correlation(rows.map(row => row.errors[a]), rows.map(row => row.errors[b])));
  if (values.some(value => value === null)) return { status: 'insufficient_variance', correlation: null };
  return { status: 'measured', sampleSize: rows.length, pairwise: values,
    correlation: values.reduce((sum, value) => sum + value, 0) / values.length, sourceRefs: rows.flatMap(row => row.sourceRefs) };
}

function correlation(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  const variance = values => values.reduce((sum, value) => sum + value ** 2, 0);
  const x = a.map(value => value - meanA), y = b.map(value => value - meanB);
  const scale = Math.sqrt(variance(x) * variance(y));
  return scale ? x.reduce((sum, value, index) => sum + value * y[index], 0) / scale : null;
}

function sampleDigest(row) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify({ id: row.id,
    signals: row.signals, trinityBetter: row.trinityBetter, errors: row.errors, sourceRefs: row.sourceRefs })).digest('hex')}`;
}

function verifiedSample(row) {
  return audit.isVerifiedReceipt(row.receipt) && row.receipt.resultId === row.id && row.receipt.evidenceDigest === sampleDigest(row)
    && receipts.validateReceipt(row.receipt, trust.listVerifierDigests());
}

module.exports = { calibrate, evaluate, errorCorrelation, sampleDigest };
