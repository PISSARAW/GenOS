'use strict';
const { DEME_STATUSES } = require('../constants');
const store = require('../metapopulationStore');
const TRANSITIONS = Object.freeze({
  FOUNDING: ['ESTABLISHING', 'COLLAPSED', 'QUARANTINED'], ESTABLISHING: ['ACTIVE', 'AT_RISK', 'COLLAPSED', 'QUARANTINED'],
  ACTIVE: ['STRESSED', 'AT_RISK', 'DORMANT', 'QUARANTINED'], STRESSED: ['ACTIVE', 'AT_RISK', 'QUARANTINED'],
  AT_RISK: ['ACTIVE', 'COLLAPSED', 'QUARANTINED'], COLLAPSED: ['RECOLONIZING'], DORMANT: ['ACTIVE', 'COLLAPSED'],
  QUARANTINED: ['RECOLONIZING', 'COLLAPSED'], RECOLONIZING: ['ESTABLISHING', 'COLLAPSED', 'QUARANTINED']
});
async function transitionDeme(input, options = {}) {
  const { sessionId, demeId, status: nextStatus } = input;
  if (!options.db) throw Object.assign(new Error('Database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  if (!DEME_STATUSES.includes(nextStatus)) throw Object.assign(new Error('Unsupported deme status.'), { code: 'METAPOPULATION_DEME_INVALID' });
  const current = await store.getDeme(options.db, sessionId, demeId);
  if (!current) throw Object.assign(new Error('Unknown deme.'), { code: 'METAPOPULATION_DEME_UNKNOWN' });
  if (!TRANSITIONS[current.status]?.includes(nextStatus)) throw Object.assign(new Error('Invalid deme transition.'), { code: 'METAPOPULATION_DEME_TRANSITION_INVALID' });
  return store.transitionDeme(options.db, { metapopulationId: sessionId, demeId, status: nextStatus });
}
module.exports = { transitionDeme, TRANSITIONS };
