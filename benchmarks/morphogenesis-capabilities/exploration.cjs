'use strict';
const meristem = require('../../backend/src/services/morphogenesis/capabilities/epistemicMeristem');
const spiral = require('../../backend/src/services/morphogenesis/capabilities/unblockSpiral');
const chrono = require('../../backend/src/services/morphogenesis/capabilities/chronotaxis');
function experiments() {
  return Array.from({ length: 12 }, (_, i) => ({ experimentId: `test:${i}`, hypothesisId: `cause:${i % 4}`,
    verifierId: `verifier:${i}`, predictions: [`cause:${i % 4}`], discriminatingOutcomes: [`observed:${i % 4}`, 'absent'],
    dependencies: [`component:${i % 4}`], failureModes: [`cause:${i % 4}`], utility: 1, cost: 1,
    role: `role:${i % 3}`, embedding: [i % 3, Math.floor(i / 3)] }));
}
function farthest(candidates) {
  const selected = [candidates[0]];
  while (selected.length < 3) {
    const scored = candidates.filter((item) => !selected.includes(item)).map((item) => ({ item,
      distance: Math.min(...selected.map((old) => (item.embedding[0] - old.embedding[0]) ** 2 + (item.embedding[1] - old.embedding[1]) ** 2)) }));
    scored.sort((a, b) => b.distance - a.distance);
    selected.push(scored[0].item);
  }
  return selected;
}
function meristemBench() {
  const candidates = experiments();
  const strategies = {
    roles: () => candidates.slice(0, 3), embedding: () => farthest(candidates), dpp: () => dpp(candidates),
    behavioral: (coverage) => meristem.rankExperiments({ candidates, coverageReceipts: coverage }).slice(0, 3).map((item) => item.experiment),
    noInhibition: () => candidates.slice(0, 3)
  };
  return Object.entries(strategies).map(([policy, choose]) => {
    let solved = 0;
    for (let cause = 0; cause < 4; cause++) {
      const coverage = [];
      let found = false;
      for (let wave = 0; wave < 2; wave++) {
        const chosen = choose(coverage);
        if (chosen.some((item) => item.hypothesisId === `cause:${cause}`)) found = true;
        coverage.push(...chosen.map((experiment) => ({ experiment, status: 'VERIFIED', verifierId: experiment.verifierId, evidenceRefs: ['synthetic:trial'] })));
      }
      if (found) solved++;
    }
    return { policy, solved, cases: 4, experimentBudgetPerCase: 6 };
  });
}
function spiralCase(target, threshold) {
  const attempts = [];
  let cost = 0;
  for (let step = 0; step < 20; step++) {
    const limit = spiral.scaleLimit({ attempts, stagnationThreshold: threshold });
    const candidates = spiral.SCALES.flatMap((scale) => [0, 1, 2].map((family) => ({
      initialState: 'seed', hypothesis: 'hidden cause', family: `method:${family}`, scale, evidenceRefs: ['synthetic:profile'] })));
    const planned = spiral.planNext({ attempts, candidates, maxScaleIndex: limit.maxScaleIndex });
    if (!planned.permitted) return { solved: false, cost };
    const scale = spiral.SCALES.indexOf(planned.candidate.scale);
    cost += 2 ** scale;
    const success = scale === target;
    attempts.push({ ...planned.candidate, outcomeStatus: success ? 'VERIFIED_SUCCESS' : 'VERIFIED_FAILURE' });
    if (success) return { solved: true, cost, attempts: attempts.length };
  }
  return { solved: false, cost };
}
function spiralBench() {
  return [1, 2, 3].map((threshold) => ({ threshold, allocation: threshold === 2 ? 'phi-rounded' : 'integer-control',
    cases: [0, 0, 1, 1, 2, 3, 4, 5].map((target) => ({ target, ...spiralCase(target, threshold) })) }));
}
function temporalBench(random) {
  return ['fixed', 'offset', 'jitter', 'phi', 'feedback'].map((policy) => {
    const times = [];
    const counts = Array(12).fill(0);
    for (let index = 0; index < 120; index++) {
      const phase = temporalPhase({ policy, index, counts, random });
      times.push(index + phase);
      counts[Math.min(11, Math.floor(phase * 12))]++;
    }
    return { policy, probes: times.length, coveredBins: counts.filter((n) => n > 0).length,
      periodicDetections: times.filter((time) => time % 1 > 0.4 && time % 1 < 0.5).length,
      quasiperiodicDetections: times.filter((time) => (time * Math.SQRT2) % 1 < 0.1).length };
  });
}
function temporalPhase(input) {
  if (input.policy === 'fixed') return 0;
  if (input.policy === 'offset') return 0.3;
  if (input.policy === 'jitter') return input.random();
  if (input.policy === 'phi') return chrono.phase(input.index);
  return chrono.feedbackPhase({ periodMs: 1000, binCounts: input.counts }, input.index);
}
module.exports = { meristemBench, spiralBench, temporalBench };

function kernel(left, right) {
  return Math.exp(-((left.embedding[0] - right.embedding[0]) ** 2 + (left.embedding[1] - right.embedding[1]) ** 2) / 2);
}
function determinant(items) {
  const a = kernel(items[0], items[1]);
  const b = kernel(items[0], items[2]);
  const c = kernel(items[1], items[2]);
  return 1 + 2 * a * b * c - a * a - b * b - c * c;
}
function dpp(candidates) {
  let best = { score: -1, items: [] };
  for (let a = 0; a < candidates.length; a++) {
    for (let b = a + 1; b < candidates.length; b++) {
      for (let c = b + 1; c < candidates.length; c++) {
        const items = [candidates[a], candidates[b], candidates[c]];
        const score = determinant(items);
        if (score > best.score) best = { score, items };
      }
    }
  }
  return best.items;
}