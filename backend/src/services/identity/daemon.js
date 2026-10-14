'use strict';

const store = require('./storage');
const incarnations = require('./incarnations');
const projection = require('./projection');

async function register(runtime, daemonId, session) {
  if (!runtime.db) return null;
  await store.ready(runtime.db);
  return incarnations.activate(runtime.db, { agentId: daemonId, ownerId: runtime.identityOwner, session, ttlMs: 120000 });
}

async function check(runtime, state) {
  if (!runtime.db) return;
  await incarnations.assertSession(runtime.db, state.identitySession);
  state.identitySession = await register(runtime, state.identitySession.agentId, state.identitySession);
}

async function describe(runtime, daemonId) {
  if (!runtime.db) return { verified: false, reason: 'VOLATILE_RUNTIME' };
  return projection.describe(runtime.db, { agentId: daemonId }).catch(error => ({ verified: false,
    reason: error.code || 'IDENTITY_STORAGE_UNAVAILABLE' }));
}

async function release(runtime, daemonId) {
  const state = runtime.daemons.get(daemonId);
  if (runtime.db && state?.identitySession) await incarnations.release(runtime.db, state.identitySession);
  runtime.daemons.delete(daemonId);
}

module.exports = { register, check, describe, release };
