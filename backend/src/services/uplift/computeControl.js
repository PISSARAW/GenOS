'use strict';

const { summarizePaired } = require('./pairedStats');

const NAIVE_STRATEGIES = Object.freeze([
  'independent_samples',
  'self_consistency',
  'retry',
  'majority_vote'
]);

function triplesFor(runs, base) {
  const byCase = new Map();
  for (const r of runs || []) {
    if (!matchesBase(r, base)) continue;
    addRun(byCase, r);
  }
  const triples = [];
  for (const m of byCase.values()) {
    if (hasCompleteTriple(m)) triples.push(toTriple(m));
  }
  return triples;
}

function matchesBase(run, base) {
  return run.suite === base.suite && run.model === base.model;
}

function addRun(byCase, run) {
  const replicate = run.replicate || 0;
  const key = `${run.case_id}:${replicate}`;
  if (!byCase.has(key)) byCase.set(key, { case_id: run.case_id, replicate });
  byCase.get(key)[run.mode] = run.score;
}

function hasCompleteTriple(metric) {
  return Number.isFinite(metric.solo) && Number.isFinite(metric.compute_control) && Number.isFinite(metric.genos);
}

function toTriple(metric) {
  return { case_id: metric.case_id, replicate: metric.replicate,
    solo: metric.solo, control: metric.compute_control, genos: metric.genos };
}

function pairsFrom(triples, left, right) {
  return triples.map((t) => ({ solo: t[left], genos: t[right], case_id: t.case_id }));
}

function summarizeABC(triples, opts) {
  const cfg = opts || {};
  const controlOverSolo = summarizePaired(pairsFrom(triples, 'solo', 'control'), cfg);
  const genosOverControl = summarizePaired(pairsFrom(triples, 'control', 'genos'), cfg);
  const genosOverSolo = summarizePaired(pairsFrom(triples, 'solo', 'genos'), cfg);
  return {
    n: triples.length,
    controlOverSolo,
    genosOverControl,
    genosOverSolo,
    organizationBonus: genosOverControl.beaten === true,
    fullOrdering: controlOverSolo.beaten === true && genosOverControl.beaten === true && genosOverSolo.beaten === true,
    kind: 'metric',
    qualityGuarantee: false
  };
}

module.exports = {
  NAIVE_STRATEGIES,
  triplesFor,
  summarizeABC
};
