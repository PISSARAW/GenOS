'use strict';

const crypto = require('node:crypto');

function defectMatches(left, right) {
  return left.code === right.code && String(left.section || '') === String(right.section || '');
}

function findResolvedDefects(defectsA, defectsB) {
  const safeA = Array.isArray(defectsA) ? defectsA : [];
  const safeB = Array.isArray(defectsB) ? defectsB : [];
  return safeA.filter((dA) => !safeB.some((dB) => defectMatches(dA, dB)));
}

function findIntroducedDefects(defectsA, defectsB) {
  const safeA = Array.isArray(defectsA) ? defectsA : [];
  const safeB = Array.isArray(defectsB) ? defectsB : [];
  return safeB.filter((dB) => !safeA.some((dA) => defectMatches(dA, dB)));
}

function computeDeltaScore(scoreA, scoreB) {
  const numA = Number.isFinite(scoreA) ? scoreA : 0;
  const numB = Number.isFinite(scoreB) ? scoreB : 0;
  return Number((numB - numA).toFixed(2));
}

function determineComparisonVerdict(delta, introducedCount, resolvedCount) {
  if (introducedCount > 0 && delta <= 0) return 'regressive';
  if (delta > 0 && introducedCount === 0) return 'superior';
  if (delta > 0 && resolvedCount > introducedCount) return 'superior_with_tradeoffs';
  if (delta < 0) return 'inferior';
  return 'tied';
}

function compareVersions(vA, vB, options = {}) {
  const resolved = findResolvedDefects(vA.defects, vB.defects);
  const introduced = findIntroducedDefects(vA.defects, vB.defects);
  const scoreA = vA.score ?? vA.overallScore ?? 0;
  const scoreB = vB.score ?? vB.overallScore ?? 0;
  const delta = computeDeltaScore(scoreA, scoreB);
  const verdict = determineComparisonVerdict(delta, introduced.length, resolved.length);
  const isBetter = verdict === 'superior' || (verdict === 'superior_with_tradeoffs' && delta >= 5);
  const regressionFree = introduced.length === 0;

  const comparison = {
    versionA: vA.version || 1,
    versionB: vB.version || 2,
    scoreA,
    scoreB,
    delta,
    scoreDelta: delta,
    verdict,
    isBetter,
    regressionFree,
    resolvedDefectsCount: resolved.length,
    introducedDefectsCount: introduced.length,
    resolvedDefects: resolved,
    introducedDefects: introduced,
    resolvedDefectCodes: resolved.map((d) => d.code),
    introducedDefectCodes: introduced.map((d) => d.code),
    comparedAt: new Date().toISOString()
  };

  const digest = crypto.createHash('sha256').update(JSON.stringify(comparison)).digest('hex');
  return { ...comparison, comparisonDigest: digest };
}

function evaluateDoubleBlindConsistency(prefForward, prefReversed) {
  if (prefForward === 'A' && prefReversed === 'B') return { consistent: true, favored: 'A' };
  if (prefForward === 'B' && prefReversed === 'A') return { consistent: true, favored: 'B' };
  return { consistent: false, favored: 'none', reason: 'POSITION_BIAS_OR_INDECISION' };
}

module.exports = {
  compareVersions,
  findResolvedDefects,
  findIntroducedDefects,
  evaluateDoubleBlindConsistency
};
