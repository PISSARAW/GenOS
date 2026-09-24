'use strict';
const store = require('../metapopulationStore');
const { validateDeme } = require('../contracts/demeContract');
async function createDeme(input, options = {}) {
  requireContext(options);
  const deme = validateDeme({ status: 'FOUNDING', members: [], localStrategies: [], localProcedures: [], lineage: {}, fitness: {}, diversity: 0, ...input });
  if (deme.status !== 'FOUNDING') throw Object.assign(new Error('A new deme must start in FOUNDING.'), { code: 'METAPOPULATION_DEME_INVALID' });
  return store.createDeme(options.db, options.metapopulationId, deme);
}
async function getDeme(demeId, options = {}) { requireContext(options); return store.getDeme(options.db, options.metapopulationId, demeId); }
async function listDemes(options = {}) { requireContext(options); return store.listDemes(options.db, options.metapopulationId); }
function requireContext(options) {
  if (!options.db || !options.metapopulationId) throw Object.assign(new Error('Database and metapopulationId are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
}
module.exports = { createDeme, getDeme, listDemes };
