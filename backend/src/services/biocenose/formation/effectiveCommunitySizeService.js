'use strict';

function errorCorrelation(left, right) {
  if (!left.errorVectorScope || left.errorVectorScope !== right.errorVectorScope) return null;
  const a = left.errorVector;
  const b = right.errorVector;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length < 2) return null;
  return pearsonCorrelation(a, b);
}

function pearsonCorrelation(left, right) {
  const meanLeft = mean(left);
  const meanRight = mean(right);
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const deltaLeft = left[index] - meanLeft;
    const deltaRight = right[index] - meanRight;
    covariance += deltaLeft * deltaRight;
    varianceLeft += deltaLeft ** 2;
    varianceRight += deltaRight ** 2;
  }
  if (!varianceLeft || !varianceRight) return null;
  return covariance / Math.sqrt(varianceLeft * varianceRight);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function effectiveCommunitySize(members) {
  const list = Array.isArray(members) ? members : [];
  if (!hasCompleteErrorVectors(list)) return { observedSize: list.length, effectiveSize: null, measured: false, pairCount: 0 };
  const correlations = [];
  for (let left = 0; left < list.length; left += 1) {
    for (let right = left + 1; right < list.length; right += 1) {
      const correlation = errorCorrelation(list[left], list[right]);
      if (correlation !== null) correlations.push(correlation);
    }
  }
  if (!correlations.length) return { observedSize: list.length, effectiveSize: null, measured: false, pairCount: 0 };
  const meanCorrelation = Math.max(0, mean(correlations));
  const effectiveSize = list.length / (1 + (list.length - 1) * meanCorrelation);
  return {
    observedSize: list.length,
    effectiveSize: Number(effectiveSize.toFixed(3)),
    meanErrorCorrelation: Number(meanCorrelation.toFixed(3)),
    pairCount: correlations.length,
    measured: true,
    basis: 'aligned_historical_error_vectors'
  };
}

function hasCompleteErrorVectors(members) {
  if (members.length < 2) return false;
  const scope = members[0].errorVectorScope;
  const vectorSize = members[0].errorVector?.length;
  return Boolean(scope && vectorSize > 1 && members.every((member) =>
    member.errorVectorScope === scope && Array.isArray(member.errorVector) && member.errorVector.length === vectorSize));
}

module.exports = { effectiveCommunitySize, errorCorrelation };
