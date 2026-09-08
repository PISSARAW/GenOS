const arena = require('../services/arenaService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Arena is alive via gRPC!" }),

  RunTournament: async (call, callback) => {
    try {
      let spec = {};
      if (call.request?.problem_spec_json) {
        spec = JSON.parse(call.request.problem_spec_json);
      }
      const result = await arena.runTournament(spec);
      callback(null, {
        success: true,
        winner: result.bestSolver?.name || 'mcts_solver',
        leaderboard_json: JSON.stringify(result.leaderboard || [])
      });
    } catch (err) {
      callback(null, { success: false, winner: '', leaderboard_json: JSON.stringify({ error: err.message }) });
    }
  },

  CalculatePareto: (call, callback) => {
    try {
      const candidates = call.request?.candidates_json ? JSON.parse(call.request.candidates_json) : [];
      const result = arena.calculateParetoFront(candidates);
      callback(null, {
        pareto_count: result.paretoFrontCount || 0,
        pareto_front_json: JSON.stringify(result.paretoFront || []),
        knee_point_json: JSON.stringify(result.kneePointRecommendation || {})
      });
    } catch (err) {
      callback(null, { pareto_count: 0, pareto_front_json: '[]', knee_point_json: '{}' });
    }
  },

  GetLeaderboard: (call, callback) => {
    const solvers = Object.entries(arena.SOLVER_PROFILES).map(([key, p]) => ({
      key,
      name: p.name,
      elo: p.baseElo
    }));
    callback(null, { solvers });
  }
};
