const {
  SOLVER_PROFILES,
  executeSolver
} = require('./arenaSolvers');

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

function solverProfileValue(solverKey, field, fallback) {
  const profile = SOLVER_PROFILES[solverKey];
  const value = profile ? profile[field] : undefined;
  return value || fallback;
}

function resolveAgentId(agentIds, index) {
  if (agentIds.length === 0) return null;
  return agentIds[index % agentIds.length];
}

function hasTournamentOptionKeys(value) {
  if (!value || typeof value !== 'object') return false;
  return 'problemSpec' in value || 'solverKeys' in value || 'rounds' in value || 'agentIds' in value;
}

function buildTournamentConfig(args) {
  return {
    problemSpec: args.length > 0 ? args[0] : undefined,
    solverKeys: args.length > 1 && args[1] !== undefined ? args[1] : [],
    rounds: args.length > 2 && args[2] !== undefined ? args[2] : 3,
    agentIds: args.length > 3 && args[3] !== undefined ? args[3] : []
  };
}

function resolveTournamentOptions(options, args) {
  if (args.length > 1 || !hasTournamentOptionKeys(options)) {
    return buildTournamentConfig(args);
  }
  return {
    problemSpec: options.problemSpec,
    solverKeys: options.solverKeys !== undefined ? options.solverKeys : [],
    rounds: options.rounds !== undefined ? options.rounds : 3,
    agentIds: options.agentIds !== undefined ? options.agentIds : []
  };
}

function assertKnownSolvers(solverKeys) {
  for (const solverKey of solverKeys) {
    if (!SOLVER_PROFILES[solverKey]) throw new Error(`Unknown solver '${solverKey}'.`);
  }
}

function isNumericValue(value) {
  return Number.isFinite(Number(value));
}

function isAscending(values) {
  for (let index = 1; index < values.length; index++) {
    if (Number(values[index]) < Number(values[index - 1])) return false;
  }
  return true;
}

function assertBenchmarkCases(problem) {
  for (const benchmarkCase of problem.cases) {
    if (benchmarkCase.values.length === 0 || !benchmarkCase.values.every(isNumericValue)) {
      throw new Error('Benchmark cases must contain non-empty numeric values.');
    }
    if (!isAscending(benchmarkCase.values)) {
      throw new Error('Benchmark values must be sorted in ascending order.');
    }
    if (!isNumericValue(benchmarkCase.target)) throw new Error('Benchmark targets must be numeric.');
  }
}

function buildTraceEntry(round, problem, step) {
  return {
    round,
    caseId: problem.cases[(round - 1) % problem.cases.length].id,
    passed: step.passed,
    steps: step.trace
  };
}

function collectSolverTotals(solverKey, problem, rounds) {
  let executionTimeMs = 0;
  let tokenCostUSD = 0;
  let fitnessScore = 0;
  let adversarialPassRate = 0;
  let steps = 0;
  const traces = [];
  for (let round = 1; round <= rounds; round++) {
    const step = evaluateSolverStep(solverKey, problem, round);
    executionTimeMs += step.executionTimeMs;
    tokenCostUSD += step.tokenCostUSD;
    fitnessScore += step.fitnessScore;
    adversarialPassRate += step.adversarialPassRate;
    steps += step.stepsTaken;
    traces.push(buildTraceEntry(round, problem, step));
  }
  return { executionTimeMs, tokenCostUSD, fitnessScore, adversarialPassRate, steps, traces };
}

function buildSolverResult(solverKey, problem, context) {
  const totals = collectSolverTotals(solverKey, problem, context.rounds);
  const avgFitness = Number((totals.fitnessScore / context.rounds).toFixed(1));
  const avgPassRate = Number((totals.adversarialPassRate / context.rounds).toFixed(1));
  const baseElo = solverProfileValue(solverKey, 'baseElo', 1500);
  return {
    agentId: resolveAgentId(context.agentIds, context.index),
    solverKey,
    solverName: solverProfileValue(solverKey, 'name', solverKey),
    archetype: solverProfileValue(solverKey, 'archetype', 'Custom'),
    roundsCompleted: context.rounds,
    totalSteps: totals.steps,
    executionTimeMs: Number((totals.executionTimeMs / context.rounds).toFixed(3)),
    tokenCostUSD: Number((totals.tokenCostUSD / context.rounds).toFixed(4)),
    fitnessScore: avgFitness,
    adversarialPassRate: avgPassRate,
    eloRating: baseElo + Math.round((avgFitness - 80) * 2.5 + (avgPassRate - 75) * 1.5),
    traces: totals.traces
  };
}

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

function computeRange(values, delta) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Number.isFinite(max) && max > min) {
    return { min, max };
  }
  return { min, max: min + delta };
}

function collectField(items, field) {
  const values = [];
  for (const item of items) values.push(item[field]);
  return values;
}

function normalize(value, minimum, maximum) {
  return maximum > minimum ? (value - minimum) / (maximum - minimum) : 0.5;
}

function buildKneeRanges(paretoSet) {
  return {
    time: computeRange(collectField(paretoSet, 'executionTimeMs'), 1),
    cost: computeRange(collectField(paretoSet, 'tokenCostUSD'), 0.001),
    fitness: computeRange(collectField(paretoSet, 'fitnessScore'), 1),
    passRate: computeRange(collectField(paretoSet, 'adversarialPassRate'), 1)
  };
}

function normalizeSolution(solution, ranges) {
  return {
    time: normalize(solution.executionTimeMs, ranges.time.min, ranges.time.max),
    cost: normalize(solution.tokenCostUSD, ranges.cost.min, ranges.cost.max),
    fitness: normalize(solution.fitnessScore, ranges.fitness.min, ranges.fitness.max),
    passRate: normalize(solution.adversarialPassRate, ranges.passRate.min, ranges.passRate.max)
  };
}

function distanceToUtopia(norms) {
  return Math.sqrt(
    Math.pow(norms.time, 2) +
    Math.pow(norms.cost, 2) +
    Math.pow(1 - norms.fitness, 2) +
    Math.pow(1 - norms.passRate, 2)
  );
}

function solutionSortKey(solution) {
  return String(solution.candidateId || solution.solverKey || solution.id || '');
}

function findKneePoint(paretoSet) {
  if (!paretoSet || paretoSet.length === 0) return null;
  if (paretoSet.length === 1) return paretoSet[0];
  const ranges = buildKneeRanges(paretoSet);
  let bestPoint = paretoSet[0];
  let minDistanceToIdeal = Infinity;
  for (const sol of paretoSet) {
    const dist = distanceToUtopia(normalizeSolution(sol, ranges));
    const currentKey = solutionSortKey(sol);
    const bestKey = solutionSortKey(bestPoint);
    if (dist < minDistanceToIdeal || (dist === minDistanceToIdeal && currentKey.localeCompare(bestKey) < 0)) {
      minDistanceToIdeal = dist;
      bestPoint = sol;
    }
  }
  return bestPoint;
}

function defaultIfNullish(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return value;
}

function normalizeSolutionInput(solution) {
  if (!solution || typeof solution !== 'object') return solution;
  return {
    ...solution,
    executionTimeMs: defaultIfNullish(solution.executionTimeMs, 0),
    tokenCostUSD: defaultIfNullish(solution.tokenCostUSD, 0),
    fitnessScore: defaultIfNullish(solution.fitnessScore, 0),
    adversarialPassRate: defaultIfNullish(solution.adversarialPassRate, 100)
  };
}

function hasValidRanges(solution) {
  return Number(solution.executionTimeMs) >= 0
    && Number(solution.tokenCostUSD) >= 0
    && Number(solution.fitnessScore) >= 0
    && Number(solution.fitnessScore) <= 100
    && Number(solution.adversarialPassRate) >= 0
    && Number(solution.adversarialPassRate) <= 100;
}

function isValidSolution(solution) {
  if (!solution || typeof solution !== 'object') return false;
  const values = [solution.executionTimeMs, solution.tokenCostUSD, solution.fitnessScore, solution.adversarialPassRate];
  if (!values.every(isNumericValue)) return false;
  return hasValidRanges(solution);
}

function isDominatedByAny(validSolutions, index) {
  for (let j = 0; j < validSolutions.length; j++) {
    if (index !== j && dominates(validSolutions[j], validSolutions[index])) {
      return true;
    }
  }
  return false;
}

function splitParetoSets(validSolutions) {
  const paretoFront = [];
  const dominatedSolutions = [];
  for (let i = 0; i < validSolutions.length; i++) {
    if (isDominatedByAny(validSolutions, i)) {
      dominatedSolutions.push(validSolutions[i]);
    } else {
      paretoFront.push(validSolutions[i]);
    }
  }
  return { paretoFront, dominatedSolutions };
}

function buildEmptyParetoResult() {
  return {
    timestamp: new Date().toISOString(),
    totalEvaluated: 0,
    paretoFrontCount: 0,
    paretoFront: [],
    dominatedSolutions: [],
    validEvaluated: 0,
    invalidSolutions: [],
    evaluationStatus: 'no_candidates',
    kneePointRecommendation: null
  };
}

function resolveEvaluationStatus(validCount, invalidCount) {
  if (invalidCount === 0) return 'complete';
  if (validCount > 0) return 'partial_invalid_candidates';
  return 'all_candidates_invalid';
}

function recordedSolverEntry(solver) {
  return [solver.solverKey, solver];
}

function describeRecordedEntry(entry) {
  if (!entry) return 'No recorded execution for this solver.';
  return `Recorded ${entry.traces.length} benchmark executions.`;
}

function readRecordedNumber(entry, field) {
  if (!entry) return 0;
  return entry[field] || 0;
}

function readRecordedTraces(entry) {
  if (!entry) return [];
  return entry.traces || [];
}

function buildTraceSpan(key, index, context) {
  const entry = context.recordedByKey.get(key);
  return {
    traceId: context.traceId,
    spanId: `span-${key}-${index + 1}`,
    name: `execute_${key}`,
    stepNumber: index + 1,
    phase: ['Search', 'Hypothesis', 'AST_Transform', 'Verification'][index % 4],
    description: describeRecordedEntry(entry),
    latencyMs: readRecordedNumber(entry, 'executionTimeMs'),
    astDiff: JSON.stringify(readRecordedTraces(entry), null, 2),
    startTime: null,
    endTime: null,
    attributes: {
      'solver.name': solverProfileValue(key, 'name', key),
      'solver.archetype': solverProfileValue(key, 'archetype', 'Custom'),
      'solver.baseElo': solverProfileValue(key, 'baseElo', 1500)
    }
  };
}

module.exports = {
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
};
