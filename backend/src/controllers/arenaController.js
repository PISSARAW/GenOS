/**
 * GenOS Arena Controller
 * Endpoints for multi-solver tournaments, Pareto frontier optimization, and trace exports.
 */

const arenaService = require('../services/arenaService');
const telemetry = require('../services/telemetryObserver');

const MAX_CACHED_TOURNAMENTS = 256;
const tournaments = new Map();

function saveTournament(key, tournament) {
  tournaments.set(key, tournament);
  while (tournaments.size > MAX_CACHED_TOURNAMENTS) {
    const oldestKey = tournaments.keys().next().value;
    tournaments.delete(oldestKey);
  }
}

function scopeKey(req) {
  return req.tenant ? `${req.tenant.organizationId}:${req.tenant.projectId}` : 'global';
}

async function getTournament(req, res, next) {
  try {
    // Lazily seed a deterministic default tournament so the leaderboard is
    // never empty for Studio dashboards or fresh backend processes.
    const key = scopeKey(req);
    if (!tournaments.has(key)) {
      saveTournament(key, arenaService.runTournament(undefined, undefined, 3));
    }
    res.json(tournaments.get(key));
  } catch (err) {
    next(err);
  }
}

function inputError(body) {
  const rounds = body.rounds ?? 3;
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) return 'ARENA_ROUNDS_INVALID';
  if (JSON.stringify(body).length > 262144) return 'ARENA_INPUTS_INVALID';
  if (body.solvers && (!Array.isArray(body.solvers) || body.solvers.length > 8)) return 'ARENA_SOLVERS_INVALID';
  return null;
}

async function runTournament(req, res, next) {
  try {
    const { problemSpec, solvers, rounds, agentIds = [] } = req.body || {};
    const invalid = inputError(req.body || {});
    if (invalid) return res.status(400).json({ error: { code: invalid } });
    const result = arenaService.runTournament(problemSpec, solvers, rounds || 3, agentIds);
    saveTournament(scopeKey(req), result);
    result.leaderboard.forEach((solver) => telemetry.emitEvent({
      eventType: 'ARENA_SOLVER_EVALUATED',
      agentId: solver.agentId || 'arena_orchestrator',
      action: 'SOLVE',
      detail: `${solver.solverName} evaluated ${result.problem.title}`,
      severity: 'info',
      payload: { tournamentId: result.tournamentId, solverKey: solver.solverKey, fitness: solver.fitnessScore }
    }));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getPareto(req, res, next) {
  try {
    const tournament = tournaments.get(scopeKey(req));
    const solutions = req.body?.solutions || tournament?.leaderboard || null;
    const paretoResult = arenaService.calculateParetoFront(solutions);
    res.json(paretoResult);
  } catch (err) {
    next(err);
  }
}

async function getTrace(req, res, next) {
  try {
    const { tournamentId, format } = req.query;
    const tournament = tournaments.get(scopeKey(req));
    if (tournamentId && tournament?.tournamentId !== tournamentId) return res.status(404).json({ error: { code: 'TOURNAMENT_NOT_FOUND' } });
    if (!tournament) {
      return res.json({ traceId: null, format: format || 'json-dag', exportedAt: null, spans: [] });
    }
    const solverKeys = tournament.leaderboard.map((solver) => solver.solverKey);
    const trace = arenaService.exportTournamentTrace(tournament, { tournamentId: tournament.tournamentId, format, solverKeys });
    res.json(trace);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTournament,
  runTournament,
  getPareto,
  getTrace
};
