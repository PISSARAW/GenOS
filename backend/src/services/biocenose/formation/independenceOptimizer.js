'use strict';

const { errorCorrelation } = require('./effectiveCommunitySizeService');

function selectCandidates(candidates, role, count) {
  const pool = candidates.filter((candidate) => candidate.role === role);
  const selected = [];
  while (pool.length && selected.length < count) {
    pool.sort((left, right) => compareScore(left, right, selected));
    selected.push(pool.shift());
  }
  return selected;
}

function compareScore(left, right, selected) {
  const delta = candidateScore(right, selected) - candidateScore(left, selected);
  return delta || left.memberId.localeCompare(right.memberId);
}

function candidateScore(candidate, selected) {
  if (!selected.length) return baseCoverage(candidate);
  const overlaps = selected.map((member) => overlap(candidate, member));
  const meanOverlap = overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;
  const measuredCorrelations = selected.map((member) => errorCorrelation(candidate, member)).filter((value) => value !== null);
  const errorDependence = measuredCorrelations.length
    ? measuredCorrelations.reduce((sum, value) => sum + Math.max(0, value), 0) / measuredCorrelations.length : 0;
  return baseCoverage(candidate) + novelty(candidate, selected) - meanOverlap * 0.35 - errorDependence * 0.25;
}

function baseCoverage(candidate) {
  return Math.min(candidate.expertise.length, 4) * 0.08
    + Math.min(candidate.tools.length, 3) * 0.04
    - Math.min(1, Math.max(0, Number(candidate.coordinationCost) || 0)) * 0.1;
}

function novelty(candidate, selected) {
  const knownProviders = new Set(selected.map((member) => member.provider).filter(Boolean));
  const knownStrategies = new Set(selected.flatMap((member) => member.strategy));
  const knownSources = new Set(selected.flatMap((member) => member.retrievalSources));
  return Number(Boolean(candidate.provider && !knownProviders.has(candidate.provider)) * 0.2)
    + candidate.strategy.filter((item) => !knownStrategies.has(item)).length * 0.07
    + candidate.retrievalSources.filter((item) => !knownSources.has(item)).length * 0.06;
}

function overlap(left, right) {
  const sameLineage = left.lineage && left.lineage === right.lineage ? 0.35 : 0;
  const sameModel = left.model && left.model === right.model ? 0.15 : 0;
  const sameProvider = left.provider && left.provider === right.provider ? 0.2 : 0;
  const sourceOverlap = jaccard(left.retrievalSources, right.retrievalSources) * 0.2;
  return Math.min(1, sameLineage + sameModel + sameProvider + sourceOverlap);
}

function jaccard(left = [], right = []) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((value) => b.has(value)).length / union.size;
}

module.exports = { selectCandidates, candidateScore, overlap };
