'use strict';
const { PATCH_STATUSES } = require('../constants');
const registry = require('./patchRegistry');
const store = require('../metapopulationStore');
const TRANSITIONS = Object.freeze({
  AVAILABLE: ['QUARANTINED', 'UNAVAILABLE'],
  OCCUPIED: ['VACANT', 'UNAVAILABLE'],
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
  await validateOccupancyTransition({ current, nextStatus, db: options.db, sessionId });
  return registry.changeStatus(options.db, { sessionId, patchId, status: nextStatus });
}

async function validateOccupancyTransition(context) {
  const { current, nextStatus, db, sessionId } = context;
  if (current.status === 'OCCUPIED' && nextStatus === 'UNAVAILABLE') {
    const deme = await store.getDeme(db, sessionId, current.currentDemeId);
    if (!deme || !['DORMANT', 'COLLAPSED'].includes(deme.status)) {
      throw Object.assign(new Error('An occupied patch can expire only after its deme is dormant or collapsed.'), { code: 'METAPOPULATION_PATCH_OCCUPIED' });
    }
  }
  if (current.status === 'OCCUPIED' && nextStatus === 'VACANT') {
    const deme = await store.getDeme(db, sessionId, current.currentDemeId);
    if (!deme || deme.status !== 'COLLAPSED') {
      throw Object.assign(new Error('An occupied patch can become vacant only after its deme collapses.'), { code: 'METAPOPULATION_PATCH_OCCUPIED' });
    }
  }
}
module.exports = { transitionPatch, TRANSITIONS };
