'use strict';

function predict(input) {
  const means = input.context?.priorMeans || input.state || {};
  const variances = input.context?.priorVariances || {};
  const mean = numericValues(means);
  const covariance = Object.fromEntries(Object.keys(mean).map((metric) => [metric,
    positiveVariance(variances[metric])]));
  const uncertainty = Object.values(covariance).length
    ? Object.values(covariance).reduce((sum, value) => sum + value, 0) / Object.keys(covariance).length : 0;
  return { modelId: 'bayesian_gaussian', mean, covariance, uncertainty,
    latentState: { timescale: input.timescale, prior: 'diagonal_gaussian' },
    evidenceRefs: Array.isArray(input.context?.evidenceRefs) ? input.context.evidenceRefs : [] };
}

function numericValues(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => Number.isFinite(item)));
}

function positiveVariance(value) { return Number.isFinite(value) && value > 0 ? value : 1; }

module.exports = { predict };
