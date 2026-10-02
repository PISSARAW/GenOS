'use strict';

function predict(input) {
  const mean = numericValues(input.state);
  const covariance = Object.fromEntries(Object.keys(mean).map((metric) => [metric, 0]));
  return { modelId: 'deterministic', mean, covariance, uncertainty: 0,
    latentState: { timescale: input.timescale }, evidenceRefs: evidence(input.context) };
}

function numericValues(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => Number.isFinite(item)));
}

function evidence(context) { return Array.isArray(context?.evidenceRefs) ? context.evidenceRefs : []; }

module.exports = { predict };
