'use strict';

/**
 * @file testArena.js
 * @description Arena module tests
 */

async function runArenaTests(options = {}) {
  const { request, assert } = options;
  console.log('\n--- 4. Arena: Multi-Solver Tournament & Pareto Frontier ---');
  const tournRes = await request({ method: 'GET', path: '/api/arena/tournament' });
  assert(tournRes.status === 200 && tournRes.body.leaderboard.length >= 3, 'GET /api/arena/tournament returned solver leaderboard');
  assert(tournRes.body.leaderboard[0].eloRating > 0, 'Solver ELO rating computed accurately');

  const paretoRes = await request({ method: 'GET', path: '/api/arena/pareto' });
  assert(paretoRes.status === 200 && Array.isArray(paretoRes.body.paretoFront), 'GET /api/arena/pareto returned Pareto Front');
  assert(paretoRes.body.kneePointRecommendation !== null, 'Mathematical Knee-Point identified successfully');

  const traceRes = await request({ method: 'GET', path: '/api/arena/trace?tournamentId=test-01' });
  assert(traceRes.status === 200 && traceRes.body.spans.length > 0, 'GET /api/arena/trace exported OpenTelemetry trace spans');
}

module.exports = { runArenaTests };