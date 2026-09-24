'use strict';

const BENEFITS = Object.freeze(['quality', 'evidenceGain', 'informationGain', 'robustness', 'adaptability']);
const COSTS = Object.freeze([
  'tokenCost', 'latency', 'coordinationCost', 'transitionCost',
  'errorPropagationRisk', 'privacyRisk', 'dependencyRisk'
]);
const DIMENSIONS = Object.freeze([...BENEFITS, ...COSTS]);

function validateUtilityVector(vector) {
  const errors = [];
  for (const dimension of DIMENSIONS) {
    if (!Number.isFinite(vector && vector[dimension])) errors.push(`utility dimension must be numeric: ${dimension}`);
  }
  return { valid: errors.length === 0, errors };
}

function compareDimension(left, right, dimension) {
  return BENEFITS.includes(dimension) ? left[dimension] - right[dimension] : right[dimension] - left[dimension];
}

function dominates(left, right) {
  const comparisons = DIMENSIONS.map((dimension) => compareDimension(left, right, dimension));
  return comparisons.every((value) => value >= 0) && comparisons.some((value) => value > 0);
}

module.exports = { BENEFITS, COSTS, DIMENSIONS, dominates, validateUtilityVector };
