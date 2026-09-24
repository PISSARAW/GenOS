'use strict';
const { recordHeartbeat } = require('./demeHeartbeatStore');
async function heartbeat(input, options = {}) {
  if (!options.db || !input.metapopulationId) throw Object.assign(new Error('Database and metapopulationId are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  return recordHeartbeat(options.db, input.metapopulationId, input);
}
module.exports = { heartbeat };