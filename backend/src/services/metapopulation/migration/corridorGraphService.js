'use strict';
const { buildCorridors } = require('./corridorTopologyService');
const corridorStore = require('./corridorStore');
const metapopulationStore = require('../metapopulationStore');

async function planTopology(metapopulationId, options = {}) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  const session = await metapopulationStore.loadSession(options.db, metapopulationId);
  if (!session) throw Object.assign(new Error('Unknown metapopulation session.'), { code: 'METAPOPULATION_SESSION_UNKNOWN' });
  const patchesByDeme = Object.fromEntries(session.demes.map((deme) => [
    deme.demeId, session.patches.find((patch) => patch.patchId === deme.patchId)
  ]));
  const candidateEdges = options.candidateEdges || session.migrationGraph.corridors;
  return buildCorridors(session.demes, { ...options, patchesByDeme, candidateEdges });
}

async function applyTopology(metapopulationId, options = {}) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  const corridors = await planTopology(metapopulationId, options);
  return corridorStore.replaceGraph(options.db, metapopulationId, { topology: options.policy || 'ring', corridors });
}

async function listCorridors(metapopulationId, options = {}) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  return corridorStore.listGraph(options.db, metapopulationId);
}

module.exports = { planTopology, applyTopology, listCorridors };
