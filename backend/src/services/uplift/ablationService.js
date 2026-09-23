'use strict';

const { summarizePaired } = require('./pairedStats');

function pairsOf(entry) {
  return (entry.pairs || []).map((p) => ({ solo: p.ablated, genos: p.full }));
}

function contributionOf(entry, opts) {
  const stats = summarizePaired(pairsOf(entry), opts || {});
  return {
    capability: entry.capability,
    contribution: stats.delta,
    lcb: stats.lcb,
    ucb: stats.ucb,
    causal: stats.beaten === true,
    n: stats.n,
    kind: 'metric',
    qualityGuarantee: false
  };
}

function ablationTable(entries, opts) {
  return (entries || []).map((e) => contributionOf(e, opts));
}

module.exports = { contributionOf, ablationTable };
