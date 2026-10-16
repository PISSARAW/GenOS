'use strict';

const BASELINES = Object.freeze({
  trinity: 'controlled', a_team: 'project_dag', biome: 'resource',
  biocenose: 'epistemic_jury', holobionte: 'organelle', syncytium: 'hard',
  rhizome: 'routing', metapopulation: 'balanced'
});

const MATURITIES = Object.freeze([
  'implemented', 'stable', 'partial', 'experimental', 'conceptual'
]);

const PROPOSABLE_MATURITIES = Object.freeze(['implemented']);

function topologyKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[- ]/g, '_');
}

function comparisonKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function baselineFor(topology) {
  return BASELINES[topologyKey(topology)] || null;
}

function canonicalVariant(topology, requested, available = []) {
  const raw = String(requested || '').trim();
  if (!raw || raw === 'default') return baselineFor(topology);
  const wanted = comparisonKey(raw);
  const matches = available.filter((candidate) => comparisonKey(candidate) === wanted);
  return matches.length === 1 ? matches[0] : null;
}

function knownMaturity(value) {
  return MATURITIES.includes(value);
}

function proposalEligible(value) {
  return PROPOSABLE_MATURITIES.includes(value);
}

module.exports = {
  BASELINES, MATURITIES, PROPOSABLE_MATURITIES,
  baselineFor, canonicalVariant, comparisonKey, knownMaturity,
  proposalEligible, topologyKey
};
