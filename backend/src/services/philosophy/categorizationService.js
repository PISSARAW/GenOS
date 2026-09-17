'use strict';

function validateVector(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`);
}

function similarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (!keys.size) return 1;
  let distance = 0;
  keys.forEach((key) => { distance += Math.abs(Number(a[key] || 0) - Number(b[key] || 0)); });
  return Math.max(0, 1 - distance / keys.size);
}

function classifyConcept(input = {}) {
  validateVector(input.instance, 'instance');
  const model = input.model || 'prototype';
  if (!['prototype', 'exemplar', 'classical'].includes(model)) throw new Error(`Unknown categorization model '${model}'.`);
  if (model === 'classical') return classical(input);
  const candidates = model === 'prototype' ? input.prototypes : input.exemplars;
  if (!Array.isArray(candidates)) throw new Error(`${model}s must be an array.`);
  const scores = candidates.map((candidate) => ({
    category: candidate.category,
    score: similarity(input.instance, candidate.features || candidate.vector || {})
  })).sort((a, b) => b.score - a.score);
  return { model, category: scores[0]?.category || null, scores, status: 'graded_membership' };
}

function classical(input) {
  const required = Array.isArray(input.requiredFeatures) ? input.requiredFeatures : [];
  const missing = required.filter((feature) => !input.instance[feature]);
  return { model: 'classical', category: missing.length ? null : input.category || null, missing, status: 'necessary_conditions' };
}

module.exports = { classifyConcept, similarity };
