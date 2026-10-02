'use strict';

const registry = require('./predictiveModelRegistry');
const { levelOf } = require('./timescalePolicy');

async function predict(input) {
  if (!input?.state || typeof input.state !== 'object') throw new TypeError('Predictive state is required.');
  const timescale = levelOf(input.timescale).id;
  const modelId = input.modelId || 'deterministic';
  const result = await registry.resolve(modelId).predict({ ...input, timescale });
  return validateDistribution({ ...result, modelId, timescale });
}

function validateDistribution(result) {
  const metrics = Object.keys(result.mean || {});
  if (!metrics.length || metrics.some((metric) => !Number.isFinite(result.mean[metric])
    || !Number.isFinite(result.covariance?.[metric]) || result.covariance[metric] < 0)) {
    throw new TypeError('Predictive model must return finite means and non-negative variances.');
  }
  return { ...result, uncertainty: Number.isFinite(result.uncertainty) ? result.uncertainty : 0,
    evidenceRefs: Array.isArray(result.evidenceRefs) ? result.evidenceRefs : [] };
}

module.exports = { predict, validateDistribution };
