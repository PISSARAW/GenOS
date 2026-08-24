/**
 * GenOS Arena Controller
 * Endpoints for multi-solver tournaments, Pareto frontier optimization, and trace exports.
 */

const arenaService = require('../services/arenaService');
const telemetry = require('../services/telemetryObserver');

let lastTournament = null;

async function getTournament(req, res, next) {
  try {
    // Lazily seed a deterministic default tournament so the leaderboard is
    // never empty for Studio dashboards or fresh backend processes.
    if (!lastTournament) {
      lastTournament = arenaService.runTournament(undefined, undefined, 3);
    }
    res.json(lastTournament);
  } catch (err) {
    next(err);
  }
}

async function runTournament(req, res, next) {
  try {
    const { problemSpec, solvers, rounds, agentIds = [] } = req.body || {};
    const result = arenaService.runTournament(problemSpec, solvers, rounds || 3, agentIds);
    lastTournament = result;
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
    const solutions = req.body?.solutions || lastTournament?.leaderboard || null;
    const paretoResult = arenaService.calculateParetoFront(solutions);
    res.json(paretoResult);
  } catch (err) {
    next(err);
  }
}

async function getTrace(req, res, next) {
  try {
    const { tournamentId, format } = req.query;
    // Unknown ids fall back to the most recent tournament: Studio inspectors
    // request traces by id from their local history, which may predate a
    // backend restart that reset the in-memory tournament cache.
    if (!lastTournament) {
      return res.json({ traceId: null, format: format || 'json-dag', exportedAt: null, spans: [] });
    }
    const solverKeys = lastTournament.leaderboard.map((solver) => solver.solverKey);
    const trace = arenaService.exportTrace(tournamentId || lastTournament.tournamentId, format, solverKeys);
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
