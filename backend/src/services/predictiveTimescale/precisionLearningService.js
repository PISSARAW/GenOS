'use strict';

const { AdaptiveStateService } = require('../adaptiveStateService');

const SCOPE = 'predictive_precision_v1';

function contextKey(input) { return `${input.modelId || 'unknown'}|${input.timescale || 'unknown'}|${input.contextKey || 'default'}`; }

function score(input) {
  if (!Number.isFinite(input.mean) || !Number.isFinite(input.observed)
    || !Number.isFinite(input.variance) || input.variance < 0) throw new TypeError('Precision sample invalid.');
  const variance = Math.max(input.variance, 1e-9);
  const error = input.observed - input.mean;
  const normalized = error / Math.sqrt(variance);
  return { error, squaredError: error ** 2, nll: 0.5 * (Math.log(2 * Math.PI * variance) + (error ** 2 / variance)),
    brier: Math.min(1, normalized ** 2), covered95: Math.abs(normalized) <= 1.96,
    sharpness: Math.sqrt(variance) };
}

async function record(options) {
  if (!options?.db || !options.agentId) throw new TypeError('Precision learning store required.');
  const sample = score(options.input || {});
  const store = new AdaptiveStateService(options.db);
  const state = await store.restoreObject(SCOPE, options.agentId) || {};
  const key = contextKey(options.input);
  const previous = state[key] || emptyRecord();
  const count = previous.sampleCount + 1;
  const next = aggregate(previous, sample, count);
  state[key] = next;
  await store.persistObject(SCOPE, options.agentId, state, Date.now());
  return { ...next, precision: calibratedPrecision(next) };
}

function aggregate(previous, sample, count) {
  return { sampleCount: count, meanSquaredError: average(previous.meanSquaredError, sample.squaredError, count),
    meanNll: average(previous.meanNll, sample.nll, count), meanBrier: average(previous.meanBrier, sample.brier, count),
    coverage95: average(previous.coverage95, Number(sample.covered95), count),
    meanSharpness: average(previous.meanSharpness, sample.sharpness, count) };
}

function average(previous, value, count) { return previous + ((value - previous) / count); }

function emptyRecord() {
  return { sampleCount: 0, meanSquaredError: 0, meanNll: 0, meanBrier: 0, coverage95: 0, meanSharpness: 0 };
}

function calibratedPrecision(record) { return Math.max(0.05, Math.min(0.99, 1 / (1 + record.meanBrier))); }

async function getState(db, agentId) {
  if (!db || !agentId) throw new TypeError('Precision learning store required.');
  return new AdaptiveStateService(db).restoreObject(SCOPE, agentId) || {};
}

module.exports = { record, getState, score, contextKey, calibratedPrecision, SCOPE };
