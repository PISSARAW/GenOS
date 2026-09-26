'use strict';
const { buildCorridors } = require('./corridorTopologyService');
const corridorStore = require('./corridorStore');
const metapopulationStore = require('../metapopulationStore');
const { analyzeContribution } = require('../observability/regionalContributionService');
const { resolveMetapopulationVariant } = require('../policy/metapopulationPolicyService');

async function planTopology(metapopulationId, options = {}) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  const session = await metapopulationStore.loadSession(options.db, metapopulationId);
  if (!session) throw Object.assign(new Error('Unknown metapopulation session.'), { code: 'METAPOPULATION_SESSION_UNKNOWN' });
  const patchesByDeme = Object.fromEntries(session.demes.map((deme) => [
    deme.demeId, session.patches.find((patch) => patch.patchId === deme.patchId)
  ]));
  const policy = resolveMetapopulationVariant({ variant: session.variant }).policy;
  const candidateEdges = options.candidateEdges || session.migrationGraph.corridors || [];
  const adaptiveSeedEdges = policy.corridorTopology === 'adaptive' && !candidateEdges.length
    ? buildCorridors(session.demes, { policy: 'ring' }) : candidateEdges;
  const sourceSink = policy.directedMigration ? sourceSinkNodes(session, options) : {};
  return buildCorridors(session.demes, { ...options, ...sourceSink, policy: options.policy || policy.corridorTopology, patchesByDeme, candidateEdges: adaptiveSeedEdges });
}

function sourceSinkNodes(session, options) {
  if (Array.isArray(options.sources) && Array.isArray(options.sinks)) return { sources: options.sources, sinks: options.sinks };
  const report = analyzeContribution(session.demes, options.candidateEdges || session.migrationGraph.corridors, options.contributionOptions);
  const sources = report.demes.filter((deme) => deme.type === 'SOURCE').map((deme) => deme.demeId);
  const sinks = report.demes.filter((deme) => deme.type === 'SINK').map((deme) => deme.demeId);
  if (!sources.length) sources.push(...rankDemes(session.demes, true).slice(0, 1).map((deme) => deme.demeId));
  if (!sinks.length) sinks.push(...rankDemes(session.demes, false).filter((deme) => !sources.includes(deme.demeId)).slice(0, 1).map((deme) => deme.demeId));
  return { sources, sinks };
}

function rankDemes(demes, descending) {
  return [...demes].sort((left, right) => {
    const delta = Number(left.fitness?.score ?? left.fitness?.local ?? 0)
      - Number(right.fitness?.score ?? right.fitness?.local ?? 0);
    return descending ? -delta : delta;
  });
}

async function applyTopology(metapopulationId, options = {}) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  const corridors = await planTopology(metapopulationId, options);
  const session = await metapopulationStore.loadSession(options.db, metapopulationId);
  const policy = options.policy || resolveMetapopulationVariant({ variant: session.variant }).policy.corridorTopology || 'ring';
  return corridorStore.replaceGraph(options.db, metapopulationId, { topology: policy, corridors });
}

async function listCorridors(metapopulationId, options = {}) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  return corridorStore.listGraph(options.db, metapopulationId);
}

module.exports = { planTopology, applyTopology, listCorridors };
