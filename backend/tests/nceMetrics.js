'use strict';

/**
 * @file nceMetrics.js
 * @description Métriques pour les tests d'ablation NCE.
 */

function computeNovelty(solution, baseline) {
  const solStr = typeof solution === 'string' ? solution : JSON.stringify(solution);
  const baseStr = typeof baseline === 'string' ? baseline : JSON.stringify(baseline);
  const distance = levenshteinDistance(solStr, baseStr);
  const maxLen = Math.max(solStr.length, baseStr.length, 1);
  return Math.min(1, distance / maxLen);
}

function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function computeDiversity(solutions) {
  const unique = new Set(solutions.map((s) => JSON.stringify(s))).size;
  return solutions.length > 0 ? unique / solutions.length : 0;
}

function computePerformance(results) {
  const successes = results.filter((r) => r.success);
  const qualitySum = successes.reduce((sum, r) => sum + (r.quality ?? 0.5), 0);
  return results.length > 0 ? qualitySum / results.length : 0;
}

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

module.exports = {
  computeNovelty,
  computeDiversity,
  computePerformance,
  seededRandom,
};
