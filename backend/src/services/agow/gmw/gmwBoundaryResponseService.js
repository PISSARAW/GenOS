'use strict';

function norm(vector) { return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)); }

function cosine(left, right) {
  if (left.length !== right.length) return 0;
  const denominator = norm(left) * norm(right);
  return denominator ? left.reduce((sum, value, index) => sum + value * right[index], 0) / denominator : 0;
}

function measure(samples) {
  if (!samples.length) return { responses: [], alignment: 0, capacity: 0 };
  const responses = samples.map((sample) => sample.output);
  const alignment = samples.reduce((sum, sample) => sum + Math.abs(cosine(sample.input, sample.output)), 0) / samples.length;
  const capacity = samples.reduce((sum, sample) => sum + Math.min(1, norm(sample.output)), 0) / samples.length;
  return { responses, alignment, capacity };
}

module.exports = { measure, norm, cosine };
