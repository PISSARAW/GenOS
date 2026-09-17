'use strict';

function validateVector(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`);
}

function similarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (!keys.size) return 1;
  const score = [...keys].reduce((total, key) => total + featureSimilarity(a[key], b[key]), 0);
  return Number((score / keys.size).toFixed(3));
}

function classifyConcept(input = {}) {
  validateVector(input.instance, 'instance');
  const model = input.model || 'prototype';
  if (!['prototype', 'exemplar', 'classical', 'family_resemblance'].includes(model)) throw new Error(`Unknown categorization model '${model}'.`);
  if (model === 'classical') return classical(input);
  if (model === 'family_resemblance') return familyResemblance(input);
  const candidates = model === 'prototype' ? input.prototypes : input.exemplars;
  if (!Array.isArray(candidates)) throw new Error(`${model}s must be an array.`);
  const scores = candidates.map((candidate) => ({
    category: candidate.category,
    score: similarity(input.instance, candidate.features || candidate.vector || {}),
    typicality: candidate.typicality === undefined ? null : Number(candidate.typicality)
  })).sort((a, b) => b.score - a.score);
  const topK = model === 'exemplar' ? Math.max(1, Number(input.topK) || 3) : 1;
  const selected = scores.slice(0, topK);
  const membership = selected.length ? Number((selected.reduce((sum, item) => sum + item.score, 0) / selected.length).toFixed(3)) : 0;
  return { model, category: scores[0]?.category || null, scores, membership, typicality: scores[0]?.typicality ?? membership, status: 'graded_membership' };
}

function classical(input) {
  const required = Array.isArray(input.requiredFeatures) ? input.requiredFeatures : [];
  const missing = required.filter((feature) => input.instance[feature] === undefined || input.instance[feature] === false);
  const membership = required.length ? Number(((required.length - missing.length) / required.length).toFixed(3)) : 1;
  return { model: 'classical', category: missing.length ? null : input.category || null, missing, membership, status: 'necessary_conditions' };
}

function familyResemblance(input) {
  const features = Array.isArray(input.features) ? input.features : [];
  if (!features.length) throw new Error('family_resemblance requires features.');
  const weights = input.weights && typeof input.weights === 'object' ? input.weights : {};
  const totalWeight = features.reduce((sum, feature) => sum + Number(weights[feature] || 1), 0);
  const matchedWeight = features.reduce((sum, feature) => sum + (input.instance[feature] ? Number(weights[feature] || 1) : 0), 0);
  const membership = totalWeight ? Number((matchedWeight / totalWeight).toFixed(3)) : 0;
  const threshold = input.threshold === undefined ? 0.5 : Number(input.threshold);
  return { model: 'family_resemblance', category: membership >= threshold ? input.category || null : null, membership, threshold, matchedFeatures: features.filter((feature) => input.instance[feature]), status: 'fuzzy_membership' };
}

function featureSimilarity(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    return a.length || b.length ? a.filter((value) => b.includes(value)).length / new Set([...a, ...b]).size : 1;
  }
  if (typeof left === 'boolean' || typeof right === 'boolean') return left === right ? 1 : 0;
  if (typeof left === 'string' || typeof right === 'string') return left === right ? 1 : 0;
  const a = Number(left || 0);
  const b = Number(right || 0);
  return Math.max(0, 1 - Math.abs(a - b));
}

module.exports = { classifyConcept, similarity, familyResemblance, featureSimilarity };
