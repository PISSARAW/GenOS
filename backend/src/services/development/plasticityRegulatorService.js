'use strict';
const store = require('../axolotlStateStore');
const policy = require('../axolotlPlasticityPolicy');
let database = null;
let legacy = new Map();
function setStateStore(next) { legacy = new Map(next); }
function setAdaptivePersister(persister) { database = persister?.db || database; }
async function getPlasticity(id, input = {}) {
  if (!id) return null;
  const db = input.db || database;
  if (!db) return store.clone(legacy.get(String(id)) || policy.initial(String(id)));
  await store.ensure(db);
  return (await store.read(db, { kind: 'plasticity', id: String(id) })) || store.clone(legacy.get(String(id)) || policy.initial(String(id)));
}
async function requestChange(input = {}) {
  const db = input.db || database;
  if (!db) return { ok: false, reason: 'persistence_required' };
  await store.ensure(db);
  try {
    return await store.transaction(db, async (tx) => {
      const owner = await store.assertOwner(tx, input.id);
      const stored = await store.read(tx, { kind: 'plasticity', id: input.id });
      if (stored?.workspaceId && stored.workspaceId !== owner.workspace_id) throw store.error('AXOLOTL_WORKSPACE_CHANGED');
      const previous = policy.refreshBudget({ ...policy.initial(input.id), ...(stored || legacy.get(input.id)) });
      const rejection = policy.reject(input, previous);
      if (rejection) return { ok: false, reason: rejection };
      await policy.verifyTransition(tx, input);
      const next = { ...policy.nextState(previous, input), workspaceId: owner.workspace_id };
      const saved = await store.write(tx, { kind: 'plasticity', id: input.id, expectedVersion: stored?.version || 0, value: next });
      return { ok: true, from: previous.state, to: saved.state, state: saved };
    });
  } catch (failure) { return { ok: false, reason: failure.code || 'persistence_failed', error: failure.message }; }
}
module.exports = { getPlasticity, requestChange, setStateStore, setAdaptivePersister, STATES: policy.STATES, TRANSITIONS: policy.TRANSITIONS };
