'use strict';
const registry = require('./patchRegistry');
const { validatePatch } = require('../contracts/patchContract');
async function createPatch(input, options = {}) {
  const patch = validatePatch({ status: 'AVAILABLE', ...input });
  if (!['AVAILABLE', 'QUARANTINED', 'UNAVAILABLE'].includes(patch.status)) {
    throw Object.assign(new Error('A patch must be empty when it is created.'), { code: 'METAPOPULATION_PATCH_INVALID' });
  }
  return registry.create(requireDb(options), options.metapopulationId, patch);
}
async function getPatch(patchId, options = {}) { return registry.get(requireDb(options), options.metapopulationId, patchId); }
async function listPatches(options = {}) { return registry.list(requireDb(options), options.metapopulationId); }
function requireDb(options) {
  if (!options.db || !options.metapopulationId) throw Object.assign(new Error('Database and metapopulationId are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  return options.db;
}
module.exports = { createPatch, getPatch, listPatches };
