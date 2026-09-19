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
  if (!isValidModel(model)) throw new Error(`Unknown categorization model '${model}'.`);
  if (model === 'classical') return classical(input);
  if (model === 'family_resemblance') return familyResemblance(input);
  const candidates = model === 'prototype' ? input.prototypes : input.exemplars;
  if (!Array.isArray(candidates)) throw new Error(`${model}s must be an array.`);
  const scored = scoreAndSort(candidates, input.instance);
  const topK = pickTopK(model, input);
  const selected = scored.slice(0, topK);
  const membership = averageScore(selected);
  return buildGradedResult(model, scored, membership);
}

function isValidModel(model) {
  return ['prototype', 'exemplar', 'classical', 'family_resemblance'].includes(model);
}

function scoreAndSort(candidates, instance) {
  return candidates.map(scoreCandidate).sort((a, b) => b.score - a.score);
}

function scoreCandidate(candidate) {
  return {
    category: candidate.category,
    score: similarity(candidate.instance || candidate.features || candidate.vector || {}, candidate.features || candidate.vector || {}),
    typicality: candidate.typicality === undefined ? null : Number(candidate.typicality)
  };
}

function pickTopK(model, input) {
  if (model !== 'exemplar') return 1;
  return Math.max(1, Number(input.topK) || 3);
}

function averageScore(selected) {
  if (!selected.length) return 0;
  return Number((selected.reduce((sum, item) => sum + item.score, 0) / selected.length).toFixed(3));
}

function buildGradedResult(model, scores, membership) {
  return {
    model,
    category: scores[0]?.category || null,
    scores,
    membership,
    typicality: scores[0]?.typicality ?? membership,
    status: 'graded_membership'
  };
}

function classical(input) {
  const required = Array.isArray(input.requiredFeatures) ? input.requiredFeatures : [];
  const missing = required.filter(instMissing(input.instance));
  const membership = required.length ? Number(((required.length - missing.length) / required.length).toFixed(3)) : 1;
  return { model: 'classical', category: missing.length ? null : input.category || null, missing, membership, status: 'necessary_conditions' };
}

function instMissing(instance) {
  return (feature) => instance[feature] === undefined || instance[feature] === false;
}

function familyResemblance(input) {
  const features = toArray(input.features);
  if (!features.length) throw new Error('family_resemblance requires features.');
  const weights = normalizeWeights(input.weights);
  const totalWeight = sumFeatureWeights(features, weights);
  const matchedWeight = sumMatchedWeights(features, weights, input.instance);
  const membership = membershipRatio(totalWeight, matchedWeight);
  const threshold = resolveThreshold(input.threshold);
  return buildFuzzyResult({ input, membership, threshold, features });
}

function toArray(value) { return Array.isArray(value) ? value : []; }

function normalizeWeights(weights) {
  return (weights && typeof weights === 'object') ? weights : {};
}

function sumFeatureWeights(features, weights) {
  return features.reduce((sum, f) => sum + Number(weights[f] || 1), 0);
}

function sumMatchedWeights(features, weights, instance) {
  return features.reduce((sum, f) => sum + (instance[f] ? Number(weights[f] || 1) : 0), 0);
}

function membershipRatio(total, matched) {
  return total ? Number((matched / total).toFixed(3)) : 0;
}

function resolveThreshold(threshold) {
  return threshold === undefined ? 0.5 : Number(threshold);
}

function buildFuzzyResult(ctx) {
  const { input, membership, threshold, features } = ctx;
  return {
    model: 'family_resemblance',
    category: membership >= threshold ? input.category || null : null,
    membership,
    threshold,
    matchedFeatures: features.filter((f) => input.instance[f]),
    status: 'fuzzy_membership'
  };
}

function featureSimilarity(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return arrayOverlap(left, right);
  if (isBooleanLike(left) || isBooleanLike(right)) return scalarsEqual(left, right);
  if (isStringLike(left) || isStringLike(right)) return scalarsEqual(left, right);
  return numericSimilarity(left, right);
}

function isBooleanLike(v) { return typeof v === 'boolean'; }
function isStringLike(v) { return typeof v === 'string'; }

function arrayOverlap(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  if (!a.length || !b.length) return 1;
  const shared = a.filter((v) => b.includes(v)).length;
  const unionSize = new Set([...a, ...b]).size;
  return shared / unionSize;
}

function scalarsEqual(left, right) {
  const a = left ?? false;
  const b = right ?? false;
  return a === b ? 1 : 0;
}

function numericSimilarity(left, right) {
  const a = Number(left || 0);
  const b = Number(right || 0);
  return Math.max(0, 1 - Math.abs(a - b));
}

module.exports = { classifyConcept, similarity, familyResemblance, featureSimilarity };
