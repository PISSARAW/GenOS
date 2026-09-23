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
    if (r.suite !== base.suite || r.model !== base.model) continue;
    if (!byCase.has(r.case_id)) byCase.set(r.case_id, {});
    byCase.get(r.case_id)[r.mode] = r.score;
  }
  const triples = [];
  for (const [id, m] of byCase) {
    if (Number.isFinite(m.solo) && Number.isFinite(m.compute_control) && Number.isFinite(m.genos)) {
      triples.push({ case_id: id, solo: m.solo, control: m.compute_control, genos: m.genos });
    }
  }
  return triples;
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
    fullOrdering: controlOverSolo.beaten === true && genosOverControl.beaten === true,
    kind: 'metric',
    qualityGuarantee: false
  };
}

module.exports = {
  NAIVE_STRATEGIES,
  triplesFor,
  summarizeABC
};
