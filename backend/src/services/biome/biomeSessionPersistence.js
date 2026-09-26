'use strict';

const biofilmMatrix = require('../biofilmMatrixService');
const biomeSessionStore = require('./biomeSessionStore');
const biomeStore = require('./biomeStore');

function serialize(session) {
  return {
    mission: session.mission, biomeId: session.biomeId, ecology: session.ecology, revision: session.revision,
    variant: session.variant, variantPolicy: session.variantPolicy, variantSelection: session.variantSelection,
    variantState: session.variantState || {}, scope: session.ecology.scope,
    persistenceKey: session.persistenceKey || null, persistenceRevision: session.persistenceRevision ?? null,
    organization: session.organization, mechanisms: session.mechanisms, capabilityContract: session.capabilityContract,
    members: session.members, matrix: serializeMatrix(session.matrix)
  };
}

function serializeMatrix(matrix) {
  return { matrixId: matrix.matrixId, version: matrix.version, maxEntries: matrix.maxEntries,
    entries: [...matrix.entries.entries()], history: matrix.history };
}

function rehydrate(record) {
  const state = record.state || {};
  const matrix = biofilmMatrix.createMatrix(state.matrix?.matrixId || record.id, { maxEntries: state.matrix?.maxEntries });
  matrix.version = Number(state.matrix?.version) || 0;
  for (const [key, entry] of state.matrix?.entries || []) matrix.entries.set(key, entry);
  matrix.history = Array.isArray(state.matrix?.history) ? state.matrix.history : [];
  return { sessionId: record.id, biomeId: state.biomeId || record.id, revision: record.revision, ...state,
    ecology: state.ecology || biomeStore.createBiomeState({ biomeId: state.biomeId || record.id, missionId: record.id }), matrix };
}

async function persist(session, db) {
  if (!db) return;
  const saved = await biomeSessionStore.create(db, { id: session.sessionId, state: serialize(session) });
  session.revision = saved.revision;
  if (session.persistenceKey) await persistEnvironment(session, db);
}

async function persistEnvironment(session, db) {
  session.persistenceRevision = await biomeSessionStore.savePersistentEnvironment(db, {
    id: session.persistenceKey, state: persistentSnapshot(session), expectedRevision: session.persistenceRevision ?? null
  });
  await db.run('UPDATE topology_sessions SET state_json = ? WHERE id = ?', JSON.stringify(serialize(session)), session.sessionId);
}

function persistentSnapshot(session) {
  return { ecology: session.ecology, variantState: session.variantState, matrix: serializeMatrix(session.matrix), scope: 'persistent' };
}

function restorePersistentEnvironment(session, stored) {
  if (!stored?.state?.ecology) return;
  const previous = stored.state;
  session.persistenceRevision = stored.revision;
  session.ecology = { ...previous.ecology, biomeId: session.biomeId, missionId: session.sessionId, scope: 'persistent' };
  session.ecology.environment = { ...session.ecology.environment,
    unresolvedProblems: [...new Set([...(session.ecology.environment.unresolvedProblems || []), session.mission])] };
  session.variantState = { ...(previous.variantState || {}), ...session.variantState };
  restoreMatrix(session.matrix, previous.matrix);
}

function restoreMatrix(matrix, stored) {
  if (!stored) return;
  matrix.version = Math.max(0, Number(stored.version) || 0);
  matrix.maxEntries = Math.max(10, Number(stored.maxEntries) || matrix.maxEntries);
  matrix.history = Array.isArray(stored.history) ? stored.history : [];
  matrix.entries = new Map(stored.entries || []);
}

module.exports = { serialize, rehydrate, persist, restorePersistentEnvironment };
