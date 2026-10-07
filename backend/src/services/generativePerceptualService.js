'use strict';

function vector(value) {
  if (!Array.isArray(value)) return [];
  if (value.some((entry) => !Number.isFinite(entry))) throw new TypeError('Finite aligned perceptual vectors required.');
  return [...value];
}

function predict(input) {
  const data = input || {};
  const prior = vector(data.prior);
  const observation = vector(data.observation);
  const size = Math.max(prior.length, observation.length);
  const rawPrecision = data.precision ?? 0.5;
  if (!Number.isFinite(rawPrecision)) throw new TypeError('Finite precision required.');
  const precision = Math.max(0, Math.min(1, rawPrecision));
  const estimate = Array.from({ length: size }, (_, index) => index >= observation.length
    ? (prior[index] || 0) : (prior[index] || 0) * (1 - precision) + observation[index] * precision);
  return { prior, observation, estimate, precision, error: observation.map((value, index) => value - (prior[index] || 0)) };
}

function predictHierarchy(input) {
  const options = input || {};
  const levels = ['mission', 'situation', 'object'];
  const hierarchy = {};
  let inheritedPrior = vector(options.prior);
  for (const level of levels) {
    const explicitPrior = options.priors?.[level];
    const prior = explicitPrior === undefined ? inheritedPrior : vector(explicitPrior);
    const observed = options.observations?.[level] === undefined ? options.observation : options.observations[level];
    const result = predict({ prior, observation: observed, precision: options.precision });
    hierarchy[level] = result;
    inheritedPrior = result.estimate;
  }
  const errors = levels.flatMap((level) => hierarchy[level].error.map(Math.abs));
  const predictionError = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0;
  return { hierarchy, posterior: hierarchy.object.estimate, predictionError };
}

function interpolate(a, b, steps = 3) {
  const left = vector(a); const right = vector(b); const count = Math.max(2, Math.floor(Number(steps) || 3));
  return Array.from({ length: count }, (_, index) => { const t = index / (count - 1); return left.map((value, i) => value * (1 - t) + (right[i] || 0) * t); });
}

function inspectSpace(points) {
  const vectors = Array.isArray(points) ? points.map(vector) : [];
  return { dimensions: vectors.reduce((max, point) => Math.max(max, point.length), 0), count: vectors.length, inspectable: vectors.length > 0, continuity: vectors.length > 1 ? 'measurable' : 'insufficient_data' };
}

module.exports = { predict, predictHierarchy, interpolate, inspectSpace };
