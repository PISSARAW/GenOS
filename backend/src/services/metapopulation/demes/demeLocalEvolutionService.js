'use strict';
const store = require('../metapopulationStore');
async function updateLocalProfile(input, options = {}) {
  if (!options.db || !input.metapopulationId) throw Object.assign(new Error('Database and metapopulationId are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  return store.updateDemeProfile(options.db, input);
}
module.exports = { updateLocalProfile };