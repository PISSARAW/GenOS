'use strict';

function vector(value) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function predict(input) {
  const data = input || {};
  const prior = vector(data.prior);
  const observation = vector(data.observation);
  const size = Math.max(prior.length, observation.length);
  const precision = Math.max(0, Math.min(1, Number(data.precision) || 0.5));
  const estimate = Array.from({ length: size }, (_, index) => (prior[index] || 0) * (1 - precision) + (observation[index] || 0) * precision);
  return { prior, observation, estimate, precision, error: observation.map((value, index) => value - (prior[index] || 0)) };
}

function interpolate(a, b, steps = 3) {
  const left = vector(a); const right = vector(b); const count = Math.max(2, Math.floor(Number(steps) || 3));
  return Array.from({ length: count }, (_, index) => { const t = index / (count - 1); return left.map((value, i) => value * (1 - t) + (right[i] || 0) * t); });
}

function inspectSpace(points) {
  const vectors = Array.isArray(points) ? points.map(vector) : [];
  return { dimensions: vectors.reduce((max, point) => Math.max(max, point.length), 0), count: vectors.length, inspectable: vectors.length > 0, continuity: vectors.length > 1 ? 'measurable' : 'insufficient_data' };
}

module.exports = { predict, interpolate, inspectSpace };
