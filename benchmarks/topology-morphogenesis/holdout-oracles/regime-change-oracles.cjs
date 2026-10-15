'use strict';

// Oracles deterministes pour la campagne de changement de regime.
// Chaque verificateur prend (candidate, params) et retourne { passed, reason }.
// Les instances de taches (params figees) vivent dans regime-change-task-set.json.

function asBins(candidate, binCount) {
  if (!candidate || !Array.isArray(candidate.bins)) return null;
  if (candidate.bins.length !== binCount) return null;
  return candidate.bins;
}

function verifyCapacity(candidate, params) {
  const bins = asBins(candidate, params.bins);
  if (!bins) return { passed: false, reason: 'bins-shape' };
  const weights = new Map(params.items.map((item) => [String(item.id), Number(item.w)]));
  const seen = [];
  for (const bin of bins) {
    if (!Array.isArray(bin)) return { passed: false, reason: 'bin-shape' };
    let sum = 0;
    for (const id of bin) {
      const key = String(id);
      if (!weights.has(key)) return { passed: false, reason: 'unknown-item' };
      sum += weights.get(key);
      seen.push(key);
    }
    if (sum > params.cap) return { passed: false, reason: 'capacity-exceeded' };
  }
  const expected = params.items.map((item) => String(item.id)).sort();
  if (JSON.stringify(seen.sort()) !== JSON.stringify(expected)) {
    return { passed: false, reason: 'coverage' };
  }
  return { passed: true };
}

function verifyOrder(candidate, params) {
  const order = Array.isArray(candidate?.order) ? candidate.order : null;
  if (!order) return { passed: false, reason: 'order-shape' };
  const steps = params.steps.map(String);
  if (JSON.stringify([...order.map(String)].sort()) !== JSON.stringify([...steps].sort())) {
    return { passed: false, reason: 'coverage' };
  }
  const position = new Map(order.map((step, index) => [String(step), index]));
  const edges = [...params.edges, ...params.revealedEdges];
  const violated = edges.some(([before, after]) => position.get(String(before)) >= position.get(String(after)));
  if (violated) return { passed: false, reason: 'edge-violated' };
  return { passed: true };
}

function expectedTuples(params) {
  const found = [];
  for (let first = 1; first <= params.sum; first += 1) {
    for (let second = first + 1; second <= params.sum; second += 1) {
      const third = params.sum - first - second;
      if (third <= second) continue;
      const tuple = [first, second, third];
      if (tuple.some((value) => params.forbidden.includes(value))) continue;
      found.push(tuple.join(','));
    }
  }
  return found.sort();
}

function verifyTuples(candidate, params) {
  const tuples = Array.isArray(candidate?.tuples) ? candidate.tuples : null;
  if (!tuples) return { passed: false, reason: 'tuples-shape' };
  const actual = tuples.map((tuple) => [...tuple].map(Number).sort((a, b) => a - b).join(',')).sort();
  const expected = expectedTuples(params);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return { passed: false, reason: 'set-mismatch' };
  }
  return { passed: true, expectedCount: expected.length };
}

const VERIFIERS = Object.freeze({ verifyCapacity, verifyOrder, verifyTuples });

function verifyRegimeCandidate(task, candidate) {
  const verifier = VERIFIERS[task?.oracle];
  if (!verifier) throw new Error(`Unknown regime oracle: ${task?.oracle}`);
  return verifier(candidate, task.oracleParams);
}

module.exports = { verifyRegimeCandidate, expectedTuples, ORACLES: VERIFIERS };
