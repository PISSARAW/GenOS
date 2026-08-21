/**
 * GenOS Arena & Multi-Solver Tournament Service
 * Multi-objective Pareto optimization, ELO rating, and solver competition runtime.
 */

// Default algorithmic solvers supported by the Arena
const SOLVER_PROFILES = {
  mcts_solver: { name: 'MCTS Solver', archetype: 'Tree Search', baseElo: 1520, costPerStep: 0.003, speedMs: 420 },
  react_solver: { name: 'ReAct Solver', archetype: 'Chain-of-Thought', baseElo: 1480, costPerStep: 0.002, speedMs: 280 },
  reflexion_solver: { name: 'Reflexion Solver', archetype: 'Self-Critique', baseElo: 1560, costPerStep: 0.004, speedMs: 510 },
  beam_solver: { name: 'Beam Search Solver', archetype: 'Best-First Beam', baseElo: 1450, costPerStep: 0.0018, speedMs: 210 },
  genetic_solver: { name: 'Island Genetic Solver', archetype: 'Evolutionary', baseElo: 1510, costPerStep: 0.0025, speedMs: 360 }
};

/**
 * Calculates updated ELO rating between two competitors
 */
function calculateElo(ratingA, ratingB, scoreA) {
  const kFactor = 32;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(ratingA + kFactor * (scoreA - expectedA));
}

/**
 * Simulates an isolated solver execution step on a problem
 */
function evaluateSolverStep(solverKey, problem, roundNum) {
  const profile = SOLVER_PROFILES[solverKey] || SOLVER_PROFILES.mcts_solver;
  const difficulty = problem.difficulty || 1.0;
  
  // Deterministic pseudo-random variation based on solver key and round
  const seed = (solverKey.charCodeAt(0) * 17 + roundNum * 31) % 100 / 100;
  const stepsTaken = Math.max(3, Math.round(5 * difficulty + seed * 4));
  
  const executionTimeMs = Math.round(profile.speedMs * stepsTaken * (0.85 + seed * 0.3));
  const tokenCostUSD = Number((profile.costPerStep * stepsTaken * (0.9 + seed * 0.2)).toFixed(4));
  const fitnessScore = Number(Math.min(99.5, Math.max(60, 82 + (profile.baseElo - 1450) / 10 + seed * 12 - difficulty * 5)).toFixed(1));
  const adversarialPassRate = Number(Math.min(100, Math.max(50, 78 + seed * 20)).toFixed(1));

  return {
    solverKey,
    solverName: profile.name,
    archetype: profile.archetype,
    stepsTaken,
    executionTimeMs,
    tokenCostUSD,
    fitnessScore,
    adversarialPassRate
  };
}

/**
 * Executes a multi-solver tournament round
 */
function runTournament(problemSpec, solverKeys = [], rounds = 3) {
  const selectedSolvers = solverKeys.length > 0 ? solverKeys : Object.keys(SOLVER_PROFILES);
  const problem = problemSpec || { id: 'prob-refactor-01', title: 'Refactor AST Parser', difficulty: 1.2 };
  
  const tournamentId = `tourn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const solverResults = {};

  for (const key of selectedSolvers) {
    let totalTime = 0;
    let totalCost = 0;
    let totalFitness = 0;
    let totalPassRate = 0;
    let totalSteps = 0;

    for (let r = 1; r <= rounds; r++) {
      const step = evaluateSolverStep(key, problem, r);
      totalTime += step.executionTimeMs;
      totalCost += step.tokenCostUSD;
      totalFitness += step.fitnessScore;
      totalPassRate += step.adversarialPassRate;
      totalSteps += step.stepsTaken;
    }

    const avgFitness = Number((totalFitness / rounds).toFixed(1));
    const avgPassRate = Number((totalPassRate / rounds).toFixed(1));
    const baseElo = SOLVER_PROFILES[key]?.baseElo || 1500;

    solverResults[key] = {
      solverKey: key,
      solverName: SOLVER_PROFILES[key]?.name || key,
      archetype: SOLVER_PROFILES[key]?.archetype || 'Custom',
      roundsCompleted: rounds,
      totalSteps,
      executionTimeMs: Math.round(totalTime / rounds),
      tokenCostUSD: Number((totalCost / rounds).toFixed(4)),
      fitnessScore: avgFitness,
      adversarialPassRate: avgPassRate,
      eloRating: baseElo + Math.round((avgFitness - 80) * 2.5 + (avgPassRate - 75) * 1.5)
    };
  }

  // Rank competitors by ELO rating
  const leaderboard = Object.values(solverResults).sort((a, b) => b.eloRating - a.eloRating);

  return {
    tournamentId,
    problem,
    timestamp: new Date().toISOString(),
    leaderboard,
    topSolver: leaderboard[0] || null
  };
}

/**
 * Checks if solution A dominates solution B across 4 objectives:
 * Minimizing Time, Minimizing Cost, Maximizing Fitness, Maximizing PassRate
 */
function dominates(solA, solB) {
  const betterOrEqual = (
    solA.executionTimeMs <= solB.executionTimeMs &&
    solA.tokenCostUSD <= solB.tokenCostUSD &&
    solA.fitnessScore >= solB.fitnessScore &&
    solA.adversarialPassRate >= solB.adversarialPassRate
  );

  const strictlyBetter = (
    solA.executionTimeMs < solB.executionTimeMs ||
    solA.tokenCostUSD < solB.tokenCostUSD ||
    solA.fitnessScore > solB.fitnessScore ||
    solA.adversarialPassRate > solB.adversarialPassRate
  );

  return betterOrEqual && strictlyBetter;
}

/**
 * Identifies the mathematical Knee-Point (maximum compromise efficiency)
 */
function findKneePoint(paretoSet) {
  if (!paretoSet || paretoSet.length === 0) return null;
  if (paretoSet.length === 1) return paretoSet[0];

  // Find min/max ranges for normalization
  const times = paretoSet.map(s => s.executionTimeMs);
  const costs = paretoSet.map(s => s.tokenCostUSD);
  const fitnesses = paretoSet.map(s => s.fitnessScore);
  const passRates = paretoSet.map(s => s.adversarialPassRate);

  const minTime = Math.min(...times), maxTime = Math.max(...times) || minTime + 1;
  const minCost = Math.min(...costs), maxCost = Math.max(...costs) || minCost + 0.001;
  const minFit = Math.min(...fitnesses), maxFit = Math.max(...fitnesses) || minFit + 1;
  const minPass = Math.min(...passRates), maxPass = Math.max(...passRates) || minPass + 1;

  let bestPoint = paretoSet[0];
  let minDistanceToIdeal = Infinity;

  // Ideal point: minTime, minCost, maxFitness, maxPassRate (normalized to 0, 0, 1, 1)
  for (const sol of paretoSet) {
    const normTime = (sol.executionTimeMs - minTime) / (maxTime - minTime);
    const normCost = (sol.tokenCostUSD - minCost) / (maxCost - minCost);
    const normFit = (sol.fitnessScore - minFit) / (maxFit - minFit);
    const normPass = (sol.adversarialPassRate - minPass) / (maxPass - minPass);

    // Distance to Utopia point (0, 0, 1, 1)
    const dist = Math.sqrt(
      Math.pow(normTime, 2) +
      Math.pow(normCost, 2) +
      Math.pow(1 - normFit, 2) +
      Math.pow(1 - normPass, 2)
    );

    if (dist < minDistanceToIdeal) {
      minDistanceToIdeal = dist;
      bestPoint = sol;
    }
  }

  return bestPoint;
}

/**
 * Calculates the multi-objective Pareto Frontier from a collection of solutions
 */
function calculateParetoFront(candidateSolutions = []) {
  let solutions = candidateSolutions;

  // If no solutions passed, generate standard comparison set from tournament
  if (!solutions || solutions.length === 0) {
    const tournament = runTournament(null, [], 3);
    solutions = tournament.leaderboard;
  }

  const paretoFront = [];
  const dominatedSolutions = [];

  for (let i = 0; i < solutions.length; i++) {
    const candidate = solutions[i];
    let isDominated = false;

    for (let j = 0; j < solutions.length; j++) {
      if (i !== j && dominates(solutions[j], candidate)) {
        isDominated = true;
        break;
      }
    }

    if (isDominated) {
      dominatedSolutions.push(candidate);
    } else {
      paretoFront.push(candidate);
    }
  }

  const kneePoint = findKneePoint(paretoFront);

  return {
    timestamp: new Date().toISOString(),
    totalEvaluated: solutions.length,
    paretoFrontCount: paretoFront.length,
    paretoFront,
    dominatedSolutions,
    kneePointRecommendation: kneePoint
  };
}

/**
 * Exports execution trace bundle conforming to OpenTelemetry Spans & DAG format
 */
function exportTrace(tournamentId, format = 'json-dag') {
  const traceId = `trace-${tournamentId || 'tourn-default'}`;
  const spans = Object.keys(SOLVER_PROFILES).map((key, idx) => ({
    traceId,
    spanId: `span-${key}-${idx + 1}`,
    name: `execute_${key}`,
    startTime: Date.now() - (500 - idx * 80),
    endTime: Date.now(),
    attributes: {
      'solver.name': SOLVER_PROFILES[key].name,
      'solver.archetype': SOLVER_PROFILES[key].archetype,
      'solver.baseElo': SOLVER_PROFILES[key].baseElo
    }
  }));

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
  exportTrace
};
