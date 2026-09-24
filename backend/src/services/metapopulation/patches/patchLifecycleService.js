'use strict';
const { PATCH_STATUSES } = require('../constants');
const registry = require('./patchRegistry');
const TRANSITIONS = Object.freeze({
  AVAILABLE: ['QUARANTINED', 'UNAVAILABLE'],
  OCCUPIED: [],
  VACANT: ['AVAILABLE', 'QUARANTINED', 'UNAVAILABLE'],
  QUARANTINED: ['AVAILABLE', 'VACANT', 'UNAVAILABLE'], UNAVAILABLE: ['AVAILABLE', 'QUARANTINED']
});
async function transitionPatch(input, options = {}) {
  const { sessionId, patchId, status: nextStatus } = input;
  if (!PATCH_STATUSES.includes(nextStatus)) throw Object.assign(new Error('Unsupported patch status.'), { code: 'METAPOPULATION_PATCH_INVALID' });
  if (!options.db) throw Object.assign(new Error('Database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  const current = await registry.get(options.db, sessionId, patchId);
  if (!current) throw Object.assign(new Error('Unknown patch.'), { code: 'METAPOPULATION_PATCH_UNKNOWN' });
  if (!TRANSITIONS[current.status]?.includes(nextStatus)) throw Object.assign(new Error('Invalid patch transition.'), { code: 'METAPOPULATION_PATCH_TRANSITION_INVALID' });
  return registry.changeStatus(options.db, { sessionId, patchId, status: nextStatus });
}
module.exports = { transitionPatch, TRANSITIONS };
