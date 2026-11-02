'use strict';

const { AdaptiveStateService } = require('../adaptiveStateService');
const learning = require('./learning');
const { digest, validateObservation } = require('./contract');
const SCOPE = 'verified_procedural_competence';

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS adaptive_state (
    scope TEXT,key TEXT,payload_json TEXT,version INTEGER,updated_at TEXT,PRIMARY KEY(scope,key));
    CREATE TABLE IF NOT EXISTS adaptive_state_events (
    scope TEXT,key TEXT,event_type TEXT,event_payload TEXT,created_at TEXT);`);
}

async function load(db, input) {
  await ensure(db);
  const stored = await new AdaptiveStateService(db).restoreObject(SCOPE, input.agentId);
  if (!stored) return learning.initial();
  if (stored.hash !== digest(stored.state)) throw Error('Learned state integrity mismatch');
  for (const row of Object.values(stored.state.observations).flat()) {
    if (row.agentId !== input.agentId) throw Error('Learned state agent mismatch');
    validateObservation(row, input.verifierDigest);
  }
  return stored.state;
}

async function save(db, agentId, state) {
  await ensure(db);
  await new AdaptiveStateService(db).persistObject(SCOPE, agentId, { state, hash: digest(state) }, state.version);
  return digest(state);
}

module.exports = { ensure, load, save, SCOPE };
