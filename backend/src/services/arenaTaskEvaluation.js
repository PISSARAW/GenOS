/**
 * GenOS Arena Task Evaluation Service
 * Transforms real agent dossiers and task solutions into multi-objective
 * Pareto candidates and identifies the optimal Knee-Point recommendation.
 *
 * Thin facade over arenaEvidence / arenaScoring / arenaCandidates (N4):
 * gaming-resistant evidence checks, null-default malformed scores
 * (unscored, excluded from Pareto and leaderboard) and identity-only
 * candidate IDs live in those modules; every function here stays small.
 */

const { calculateParetoFront, calculateElo } = require('./arenaService');
const scoring = require('./arenaScoring');
const candidates = require('./arenaCandidates');
const { isVerifiableEvidenceText } = require('./arenaEvidence');

function dossierToCandidate(dossier, options) {
  return candidates.dossierToCandidate(dossier, options || {});
}

function testResultPassed(test) {
  return scoring.testResultPassed(test);
}

function toLeaderboardEntry(candidate, baseElo) {
  const fitnessRatio = Number(candidate.fitnessScore || 0) / 100;
  const passRatio = Number(candidate.adversarialPassRate || 0) / 100;
  return {
    ...candidate,
    eloRating: calculateElo(baseElo, 1500, fitnessRatio * 0.7 + passRatio * 0.3)
  };
}

function compareEloDesc(a, b) {
  if (b.eloRating !== a.eloRating) return b.eloRating - a.eloRating;
  return String(a.candidateId).localeCompare(String(b.candidateId));
}

function leaderboardFor(ranked, baseElo) {
  return ranked.map((entry) => toLeaderboardEntry(entry, baseElo)).sort(compareEloDesc);
}

function evaluateDossiersPareto(dossiers = [], options = {}) {
  const opts = options || {};
  const list = Array.isArray(dossiers) ? dossiers : [];
  const all = list.map((dossier) => candidates.dossierToCandidate(dossier, opts));
  const ranked = candidates.scoredOnly(all);
  const paretoResult = calculateParetoFront(ranked);
  const baseElo = Number(opts.baseElo || 1500);
  const leaderboard = leaderboardFor(ranked, baseElo);
  const kneePoint = paretoResult.kneePointRecommendation || leaderboard[0] || null;
  return {
    timestamp: new Date().toISOString(),
    totalEvaluated: all.length,
    paretoFrontCount: paretoResult.paretoFrontCount,
    paretoFront: paretoResult.paretoFront,
    dominatedSolutions: paretoResult.dominatedSolutions,
    unscoredCandidates: candidates.unscoredOnly(all),
    kneePoint,
    leaderboard
  };
}

function evaluateTaskBenchmark(taskSpec, solutions = []) {
  const spec = taskSpec || {};
  const list = Array.isArray(solutions) ? solutions : [];
  const all = list.map((solution, idx) => candidates.buildBenchmarkCandidate(solution, idx));
  const ranked = candidates.scoredOnly(all);
  const pareto = calculateParetoFront(ranked);
  return {
    benchmarkId: spec.id || 'real-task-benchmark',
    title: spec.title || 'Task Benchmark Evaluation',
    totalEvaluated: all.length,
    scoredCount: ranked.length,
    paretoFront: pareto.paretoFront,
    kneePoint: pareto.kneePointRecommendation,
    unscoredSolutions: candidates.unscoredOnly(all)
  };
}

module.exports = {
  dossierToCandidate,
  testResultPassed,
  evaluateDossiersPareto,
  evaluateTaskBenchmark,
  isVerifiableEvidenceText
};
