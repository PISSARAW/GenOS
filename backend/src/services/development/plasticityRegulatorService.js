'use strict';

/**
 * PlasticityRegulator (G12) : remplace l'Axolotl 2 états par 6 états
 * avec hystérésis, cooldown, budget de changement, réversibilité.
 * Façade compatible avec axolotlTopologyService.
 */

const STATES = ['NEOTENIC', 'PLASTIC', 'DIFFERENTIATING', 'CONSOLIDATING', 'STABLE', 'EMERGENCY_PLASTIC'];
const TRANSITIONS = Object.freeze({
  NEOTENIC: ['PLASTIC', 'DIFFERENTIATING', 'EMERGENCY_PLASTIC'],
  PLASTIC: ['NEOTENIC', 'DIFFERENTIATING', 'EMERGENCY_PLASTIC'],
  DIFFERENTIATING: ['PLASTIC', 'CONSOLIDATING', 'EMERGENCY_PLASTIC'],
  CONSOLIDATING: ['STABLE', 'PLASTIC', 'EMERGENCY_PLASTIC'],
  STABLE: ['NEOTENIC', 'PLASTIC', 'EMERGENCY_PLASTIC'],
  EMERGENCY_PLASTIC: ['PLASTIC', 'DIFFERENTIATING']
});

let store = new Map();
const COOLDOWN_MS = 30000;
let adaptivePersister = null;

function setStateStore(nextStore) {
  if (nextStore instanceof Map) store = nextStore;
}

function setAdaptivePersister(persister) {
  adaptivePersister = persister;
}

function getPlasticity(id) {
  if (!id) return null;
  return store.get(String(id)) || { id: String(id), state: 'NEOTENIC', changes: 0, budget: 10, lastChangeAt: null };
}

async function requestChange(opts) {
  const o = opts || {};
  const prev = getPlasticity(o.id);
  const rejection = rejectChange({ request: o, previous: prev });
  if (rejection) return rejection;
  const next = o.to;
  const state = { ...prev, state: next, changes: prev.changes + 1, budget: prev.budget - 1, lastChangeAt: Date.now(), reason: String(o.reason).trim(), history: [...(prev.history || []), { from: prev.state, to: next, reason: String(o.reason).trim(), at: new Date().toISOString() }] };
  store.set(String(o.id), state);
  try {
    await adaptivePersister?.persistMap('axolotl_plasticity', 'states', store);
    syncAxolotl(o.id, next);
  } catch (error) {
    store.set(String(o.id), prev);
    return { ok: false, reason: 'persistence_failed', error: error.message };
  }
  return { ok: true, from: prev.state, to: next, state };
}

function rejectChange({ request, previous }) {
  if (!request.id || !STATES.includes(request.to) || !String(request.reason || '').trim()) return { ok: false, reason: 'valid_id_state_and_reason_required' };
  if (!TRANSITIONS[previous.state]?.includes(request.to)) return { ok: false, reason: 'transition_not_allowed', from: previous.state, to: request.to };
  if (previous.budget <= 0) return { ok: false, reason: 'change_budget_exhausted' };
  if (cooldownActive(previous)) return { ok: false, reason: 'cooldown_active' };
  return null;
}

function cooldownActive(prev) {
  if (!prev.lastChangeAt) return false;
  return Date.now() - prev.lastChangeAt < COOLDOWN_MS;
}

function syncAxolotl(id, next) {
  try {
    const axolotl = require('../axolotlTopologyService');
    const stable = next === 'STABLE' || next === 'CONSOLIDATING';
    axolotl.setTopologyMode(id, stable ? 'stabilisé' : 'plastique');
  } catch (_) {}
}

module.exports = { getPlasticity, requestChange, setStateStore, setAdaptivePersister, STATES, TRANSITIONS };
