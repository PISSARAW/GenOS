const { performance } = require('perf_hooks');

const SOLVER_PROFILES = {
  mcts_solver: { name: 'MCTS Solver', archetype: 'Tree Search', baseElo: 1520 },
  react_solver: { name: 'ReAct Solver', archetype: 'Chain-of-Thought', baseElo: 1480 },
  reflexion_solver: { name: 'Reflexion Solver', archetype: 'Self-Critique', baseElo: 1560 },
  beam_solver: { name: 'Beam Search Solver', archetype: 'Best-First Beam', baseElo: 1450 },
  genetic_solver: { name: 'Island Genetic Solver', archetype: 'Evolutionary', baseElo: 1510 }
};

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

module.exports = {
  SOLVER_PROFILES,
  buildBenchmark,
  executeSolver
};
