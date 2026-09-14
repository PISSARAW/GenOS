const crypto = require('crypto');

const {
  SOLVER_PROFILES,
  buildBenchmark
} = require('./arenaSolvers');
const {
  resolveTournamentOptions,
  assertKnownSolvers,
  assertBenchmarkCases,
  buildSolverResult,
  normalizeSolutionInput,
  isValidSolution,
  splitParetoSets,
  buildEmptyParetoResult,
  resolveEvaluationStatus,
  findKneePoint,
  recordedSolverEntry,
  buildTraceSpan
} = require('./arenaHelpers');
const { performance } = require('perf_hooks');
let lastTournamentResult = null;

function calculateElo(ratingA, ratingB, scoreA) {
  const kFactor = 32;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(ratingA + kFactor * (scoreA - expectedA));
}

function runTournament(options = {}) {
  const config = resolveTournamentOptions(options, arguments);
  if (!Number.isInteger(config.rounds) || config.rounds < 1) throw new Error('rounds must be a positive integer.');
  const selectedSolvers = config.solverKeys.length > 0 ? config.solverKeys : Object.keys(SOLVER_PROFILES);
  const problem = buildBenchmark(config.problemSpec || {});
  assertKnownSolvers(selectedSolvers);
  assertBenchmarkCases(problem);

  const tournamentId = `tourn-${crypto.randomUUID()}`;
  const solverResults = {};

  for (let index = 0; index < selectedSolvers.length; index++) {
    solverResults[selectedSolvers[index]] = buildSolverResult(selectedSolvers[index], problem, {
      rounds: config.rounds,
      agentIds: config.agentIds,
      index
    });
  }

  const leaderboard = Object.values(solverResults).sort((a, b) => b.eloRating - a.eloRating || a.solverKey.localeCompare(b.solverKey));

  const result = {
    tournamentId,
    problem,
    timestamp: new Date().toISOString(),
    leaderboard,
    topSolver: leaderboard[0] || null
  };
  lastTournamentResult = result;
  return result;
}

function calculateParetoFront(candidateSolutions = []) {
  const rawSolutions = Array.isArray(candidateSolutions) ? candidateSolutions : [];
  if (rawSolutions.length === 0) {
    return buildEmptyParetoResult();
  }

  const solutions = rawSolutions.map(normalizeSolutionInput);
  const validSolutions = solutions.filter(isValidSolution);
  const invalidSolutions = solutions.filter((solution) => {
    return !isValidSolution(solution);
  });

  const { paretoFront, dominatedSolutions } = splitParetoSets(validSolutions);
  const kneePoint = findKneePoint(paretoFront);

  return {
    timestamp: new Date().toISOString(),
    totalEvaluated: solutions.length,
    validEvaluated: validSolutions.length,
    invalidSolutions,
    evaluationStatus: resolveEvaluationStatus(validSolutions.length, invalidSolutions.length),
    paretoFrontCount: paretoFront.length,
    paretoFront,
    dominatedSolutions,
    kneePointRecommendation: kneePoint
  };
}

function exportTrace(tournamentId, format = 'json-dag', solverKeys = Object.keys(SOLVER_PROFILES)) {
  const recorded = lastTournamentResult ? lastTournamentResult.leaderboard || [] : [];
  if (recorded.length === 0) {
    return { traceId: null, format, exportedAt: null, spans: [] };
  }
  const recordedByKey = new Map(recorded.map(recordedSolverEntry));
  const traceId = `trace-${tournamentId || lastTournamentResult.tournamentId}`;
  const context = { traceId, recordedByKey };
  const spans = solverKeys.map((key, index) => {
    return buildTraceSpan(key, index, context);
  });

  return {
    traceId,
    format,
    exportedAt: new Date().toISOString(),
    spans
  };
}

module.exports = {
  SOLVER_PROFILES,
  calculateElo,
  runTournament,
  calculateParetoFront,
  findKneePoint,
  exportTrace
};

const arenaTaskEvaluation = require('./arenaTaskEvaluation');
module.exports.evaluateDossiersPareto = (dossiers, options) => arenaTaskEvaluation.evaluateDossiersPareto(dossiers, options);
module.exports.dossierToCandidate = (dossier, options) => arenaTaskEvaluation.dossierToCandidate(dossier, options);
