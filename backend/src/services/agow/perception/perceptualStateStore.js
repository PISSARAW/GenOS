'use strict';

const SCOPE = 'agow_perceptual_state';

async function get(options) {
  const loaded = await require('../agowStatePersistenceService').load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return { bindings: [], posterior: [], lastFrameId: null, cycle: 0, ...loaded.state };
}

async function save(options) {
  const { agentId, state } = options || {};
  if (!agentId || !state) return { saved: false };
  await require('../agowStatePersistenceService').save({ scope: SCOPE, agentId, db: options.db, state, version: state.cycle });
  return { saved: true, state };
}

async function clear(options) {
  if (options?.agentId) await require('../agowStatePersistenceService').save({ scope: SCOPE, agentId: options.agentId, db: options.db, state: { bindings: [], posterior: [], lastFrameId: null, cycle: 0 } });
}

module.exports = { get, save, clear };
