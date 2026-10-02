'use strict';

function predict(input) {
  const means = input.state?.learnedMeans || {};
  const variances = input.state?.learnedVariances || {};
  const mean = numericValues(means);
  const covariance = Object.fromEntries(Object.keys(mean).map((metric) => [metric,
    Number.isFinite(variances[metric]) && variances[metric] > 0 ? variances[metric] : 1]));
  const uncertainty = Object.values(covariance).length
    ? Object.values(covariance).reduce((sum, value) => sum + value, 0) / Object.keys(covariance).length : 0;
  return { modelId: 'learned_local', mean, covariance, uncertainty,
    latentState: { timescale: input.timescale, modelVersion: input.state?.modelVersion || 'untrained' },
    evidenceRefs: Array.isArray(input.context?.evidenceRefs) ? input.context.evidenceRefs : [] };
}

function numericValues(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => Number.isFinite(item)));
}

module.exports = { predict };
