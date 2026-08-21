/**
 * GenOS Arena Controller
 * Endpoints for multi-solver tournaments, Pareto frontier optimization, and trace exports.
 */

const arenaService = require('../services/arenaService');

async function getTournament(req, res, next) {
  try {
    const result = arenaService.runTournament(null, [], 3);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function runTournament(req, res, next) {
  try {
    const { problemSpec, solvers, rounds } = req.body || {};
    const result = arenaService.runTournament(problemSpec, solvers, rounds || 3);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getPareto(req, res, next) {
  try {
    const solutions = req.body?.solutions || null;
    const paretoResult = arenaService.calculateParetoFront(solutions);
    res.json(paretoResult);
  } catch (err) {
    next(err);
  }
}

async function getTrace(req, res, next) {
  try {
    const { tournamentId, format } = req.query;
    const trace = arenaService.exportTrace(tournamentId, format);
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
