/**
 * GenOS Arena & Multi-Solver Tournament Service
 * Multi-objective Pareto optimization, ELO rating, and solver competition runtime.
 */

// Default algorithmic solvers supported by the Arena
const SOLVER_PROFILES = {
  mcts_solver: { name: 'MCTS Solver', archetype: 'Tree Search', baseElo: 1520 },
  react_solver: { name: 'ReAct Solver', archetype: 'Chain-of-Thought', baseElo: 1480 },
  reflexion_solver: { name: 'Reflexion Solver', archetype: 'Self-Critique', baseElo: 1560 },
  beam_solver: { name: 'Beam Search Solver', archetype: 'Best-First Beam', baseElo: 1450 },
  genetic_solver: { name: 'Island Genetic Solver', archetype: 'Evolutionary', baseElo: 1510 }
};

const { performance } = require('perf_hooks');
let lastTournamentResult = null;

function buildBenchmark(problemSpec = {}) {
  if (Array.isArray(problemSpec.cases) && problemSpec.cases.length > 0) {
    return {
      id: problemSpec.id || 'custom-search',
      title: problemSpec.title || 'Custom search benchmark',
      cases: problemSpec.cases.map((item, index) => ({
        id: item.id || `case-${index + 1}`,
        values: Array.isArray(item.values) ? item.values : [],
        target: item.target
      }))
    };
  }

  // A real, deterministic local benchmark. No fabricated scores or timings.
  const cases = [
    [3, 8, 13, 21, 34, 55, 89],
    [2, 5, 11, 17, 23, 29, 31, 37, 41, 43, 47],
    [1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144]
  ];
  return {
    id: problemSpec.id || 'local-sorted-search',
    title: problemSpec.title || 'Local sorted search benchmark',
    cases: cases.map((values, index) => ({ id: `case-${index + 1}`, values, target: values[(index * 3 + 2) % values.length] }))
  };
}

function executeSolver(solverKey, values, target) {
  const startedAt = performance.now();
  let index = -1;
  let steps = 0;
  const trace = [];

  if (solverKey === 'react_solver') {
    for (let i = 0; i < values.length; i += 1) {
      steps += 1;
      trace.push({ phase: 'Search', detail: `Checked index ${i}` });
      if (values[i] === target) { index = i; break; }
    }
  } else if (solverKey === 'beam_solver') {
    let left = 0;
    let right = values.length - 1;
    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      steps += 1;
      trace.push({ phase: 'Search', detail: `Expanded best candidate at index ${middle}` });
      if (values[middle] === target) { index = middle; break; }
      if (values[middle] < target) left = middle + 1;
      else right = middle - 1;
    }
  } else if (solverKey === 'genetic_solver') {
    // Interpolation search: a real alternative strategy for sorted numeric data.
    let low = 0;
    let high = values.length - 1;
    while (low <= high && target >= values[low] && target <= values[high]) {
      const denominator = values[high] - values[low];
      const probe = denominator === 0 ? low : low + Math.floor(((target - values[low]) * (high - low)) / denominator);
      steps += 1;
      trace.push({ phase: 'Hypothesis', detail: `Probed index ${probe}` });
      if (values[probe] === target) { index = probe; break; }
      if (values[probe] < target) low = probe + 1;
      else high = probe - 1;
    }
  } else {
    // MCTS and Reflexion use a verified binary-search pass in this local harness.
    let left = 0;
    let right = values.length - 1;
    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      steps += 1;
      trace.push({ phase: solverKey === 'reflexion_solver' ? 'Verification' : 'Search', detail: `Visited index ${middle}` });
      if (values[middle] === target) { index = middle; break; }
      if (values[middle] < target) left = middle + 1;
      else right = middle - 1;
    }
  }

  return { index, steps, executionTimeMs: Math.max(0, Number((performance.now() - startedAt).toFixed(3))), trace };
}

/**
 * Calculates updated ELO rating between two competitors
 */
function calculateElo(ratingA, ratingB, scoreA) {
  const kFactor = 32;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(ratingA + kFactor * (scoreA - expectedA));
}

function evaluateSolverStep(solverKey, problem, roundNum) {
  const profile = SOLVER_PROFILES[solverKey] || SOLVER_PROFILES.mcts_solver;
  const benchmarkCase = problem.cases[(roundNum - 1) % problem.cases.length];
  if (!benchmarkCase || !Array.isArray(benchmarkCase.values) || benchmarkCase.values.length === 0) {
    throw new Error('Benchmark cases must contain non-empty numeric values.');
  }
  const execution = executeSolver(solverKey, benchmarkCase.values, benchmarkCase.target);
  const passed = execution.index >= 0 && benchmarkCase.values[execution.index] === benchmarkCase.target;

  return {
    solverKey,
    solverName: profile.name,
    archetype: profile.archetype,
    stepsTaken: execution.steps,
    executionTimeMs: execution.executionTimeMs,
    tokenCostUSD: 0,
    fitnessScore: passed ? Number((100 * (1 - execution.steps / (benchmarkCase.values.length * 2))).toFixed(1)) : 0,
    adversarialPassRate: passed ? 100 : 0,
    passed,
    trace: execution.trace
  };
}

/**
 * Executes a multi-solver tournament round
 */
function runTournament(problemSpec, solverKeys = [], rounds = 3, agentIds = []) {
  const selectedSolvers = solverKeys.length > 0 ? solverKeys : Object.keys(SOLVER_PROFILES);
  const problem = buildBenchmark(problemSpec || {});
  
  const tournamentId = `tourn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const solverResults = {};

  for (const key of selectedSolvers) {
    let totalTime = 0;
    let totalCost = 0;
    let totalFitness = 0;
    let totalPassRate = 0;
    let totalSteps = 0;
    const traces = [];

    for (let r = 1; r <= rounds; r++) {
      const step = evaluateSolverStep(key, problem, r);
      totalTime += step.executionTimeMs;
      totalCost += step.tokenCostUSD;
      totalFitness += step.fitnessScore;
      totalPassRate += step.adversarialPassRate;
      totalSteps += step.stepsTaken;
      traces.push({ round: r, caseId: problem.cases[(r - 1) % problem.cases.length].id, passed: step.passed, steps: step.trace });
    }

    const avgFitness = Number((totalFitness / rounds).toFixed(1));
    const avgPassRate = Number((totalPassRate / rounds).toFixed(1));
    const baseElo = SOLVER_PROFILES[key]?.baseElo || 1500;

    solverResults[key] = {
      agentId: agentIds.length > 0 ? agentIds[Object.keys(solverResults).length % agentIds.length] : null,
      solverKey: key,
      solverName: SOLVER_PROFILES[key]?.name || key,
      archetype: SOLVER_PROFILES[key]?.archetype || 'Custom',
      roundsCompleted: rounds,
      totalSteps,
      executionTimeMs: Math.max(1, Math.round(totalTime / rounds)),
      tokenCostUSD: Number((totalCost / rounds).toFixed(4)),
      fitnessScore: avgFitness,
      adversarialPassRate: avgPassRate,
      eloRating: baseElo + Math.round((avgFitness - 80) * 2.5 + (avgPassRate - 75) * 1.5),
      traces
    };
  }

  // Rank competitors by ELO rating
  const leaderboard = Object.values(solverResults).sort((a, b) => b.eloRating - a.eloRating);

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
  const solutions = Array.isArray(candidateSolutions) ? candidateSolutions : [];
  if (solutions.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      totalEvaluated: 0,
      paretoFrontCount: 0,
      paretoFront: [],
      dominatedSolutions: [],
      kneePointRecommendation: null
    };
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
 * Exports the recorded execution trace bundle conforming to OpenTelemetry Spans & DAG format
 */
function exportTrace(tournamentId, format = 'json-dag', solverKeys = Object.keys(SOLVER_PROFILES)) {
  const recorded = lastTournamentResult?.leaderboard || [];
  if (recorded.length === 0) {
    return { traceId: null, format, exportedAt: null, spans: [] };
  }
  const recordedByKey = new Map(recorded.map((solver) => [solver.solverKey, solver]));
  const traceId = `trace-${tournamentId || lastTournamentResult.tournamentId}`;
  const spans = solverKeys.map((key, idx) => ({
    traceId,
    spanId: `span-${key}-${idx + 1}`,
    name: `execute_${key}`,
    stepNumber: idx + 1,
    phase: ['Search', 'Hypothesis', 'AST_Transform', 'Verification'][idx % 4],
    description: recordedByKey.get(key) ? `Recorded ${recordedByKey.get(key).traces.length} benchmark executions.` : 'No recorded execution for this solver.',
    latencyMs: recordedByKey.get(key)?.executionTimeMs || 0,
    astDiff: JSON.stringify(recordedByKey.get(key)?.traces || [], null, 2),
    startTime: null,
    endTime: null,
    attributes: {
      'solver.name': SOLVER_PROFILES[key]?.name || key,
      'solver.archetype': SOLVER_PROFILES[key]?.archetype || 'Custom',
      'solver.baseElo': SOLVER_PROFILES[key]?.baseElo || 1500
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
