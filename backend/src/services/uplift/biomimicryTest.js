'use strict';

const { summarizePaired } = require('./pairedStats');

const BIO_DIMENSIONS = Object.freeze(['exploration', 'recovery', 'diversity']);

function groupByDimension(samples) {
  const groups = new Map();
  for (const s of samples || []) {
    if (!s || !s.dimension) continue;
    if (!groups.has(s.dimension)) groups.set(s.dimension, []);
    groups.get(s.dimension).push({ solo: s.nonbio, genos: s.bio });
  }
  return groups;
}

function dimensionVerdicts(samples, opts) {
  const groups = groupByDimension(samples);
  const out = {};
  for (const [dim, pairs] of groups) out[dim] = summarizePaired(pairs, opts || {});
  return out;
}

function biomimeticVerdict(samples, opts) {
  const verdicts = dimensionVerdicts(samples, opts);
  const dims = BIO_DIMENSIONS;
  const wins = dims.filter((d) => verdicts[d]?.beaten === true);
  return {
    dimensions: verdicts,
    bioSuperior: wins.length === dims.length,
    missingDimensions: dims.filter((d) => !verdicts[d]),
    wins,
    kind: 'metric',
    qualityGuarantee: false
  };
}

module.exports = { BIO_DIMENSIONS, biomimeticVerdict };
