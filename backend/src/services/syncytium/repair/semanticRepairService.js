'use strict';

function choose(candidates = []) {
  const ranked = candidates.map(normalizeCandidate).sort(compareCandidates);
  if (!ranked.length) return { winner: null, requiresTrinity: false };
  const tied = ranked.length > 1 && compareMetrics(ranked[0], ranked[1]) === 0;
  return {
    winner: tied ? null : ranked[0],
    candidates: ranked,
    requiresTrinity: tied,
    route: tied ? 'TRINITY' : 'DETERMINISTIC'
  };
}

function normalizeCandidate(candidate) {
  return {
    ...candidate,
    blastRadius: nonNegative(candidate.blastRadius),
    invariantsRestored: nonNegative(candidate.invariantsRestored),
    cost: nonNegative(candidate.cost),
    informationLoss: nonNegative(candidate.informationLoss)
  };
}

function nonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : Number.MAX_SAFE_INTEGER;
}

function compareCandidates(left, right) {
  return compareMetrics(left, right) || String(left.repairId).localeCompare(String(right.repairId));
}

function compareMetrics(left, right) {
  return right.invariantsRestored - left.invariantsRestored
    || left.blastRadius - right.blastRadius
    || left.informationLoss - right.informationLoss
    || left.cost - right.cost;
}

module.exports = { choose };
