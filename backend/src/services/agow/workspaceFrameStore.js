'use strict';

const MAX_HISTORY = 100;
const SCOPE = 'agow_frames';

async function framesOf(options) {
  const loaded = await require('./agowStatePersistenceService').load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return Array.isArray(loaded.state.frames) ? loaded.state.frames : [];
}

async function save(options) {
  const { frame } = options || {};
  if (!frame?.agentId || !frame?.frameId) return { saved: false };
  const db = await require('./agowStatePersistenceService').databaseFor(options.db);
  return require('../../db').withTransaction(db, async (txDb) => {
    const history = await framesOf({ agentId: frame.agentId, db: txDb });
    history.push(frame);
    const bounded = history.slice(-MAX_HISTORY);
    await require('./agowStatePersistenceService').save({ scope: SCOPE, agentId: frame.agentId, db: txDb, state: { frames: bounded }, version: bounded.length });
    return { saved: true, frame, history: bounded };
  });
}

async function current(options) {
  const history = await framesOf(options);
  return history.at(-1) || null;
}

async function get(options) {
  const history = await framesOf(options);
  return history.find((frame) => frame.frameId === options?.frameId) || null;
}

async function history(options) {
  return framesOf(options);
}

async function clear(options) {
  if (options?.agentId) await require('./agowStatePersistenceService').save({ scope: SCOPE, agentId: options.agentId, db: options.db, state: { frames: [] } });
}

module.exports = { save, current, get, history, clear, MAX_HISTORY };
