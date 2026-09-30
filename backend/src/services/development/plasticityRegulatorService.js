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

const store = new Map();
const COOLDOWN_MS = 30000;

function getPlasticity(id) {
  if (!id) return null;
  return store.get(String(id)) || { id: String(id), state: 'NEOTENIC', changes: 0, budget: 10, lastChangeAt: null };
}

function requestChange(opts) {
  const o = opts || {};
  if (!o.id || !STATES.includes(o.to) || !String(o.reason || '').trim()) return { ok: false, reason: 'valid_id_state_and_reason_required' };
  const prev = getPlasticity(o.id);
  if (!TRANSITIONS[prev.state]?.includes(o.to)) return { ok: false, reason: 'transition_not_allowed', from: prev.state, to: o.to };
  if (prev.budget <= 0) return { ok: false, reason: 'change_budget_exhausted' };
  if (cooldownActive(prev)) return { ok: false, reason: 'cooldown_active' };
  const next = o.to;
  const state = { ...prev, state: next, changes: prev.changes + 1, budget: prev.budget - 1, lastChangeAt: Date.now(), reason: String(o.reason).trim(), history: [...(prev.history || []), { from: prev.state, to: next, reason: String(o.reason).trim(), at: new Date().toISOString() }] };
  store.set(String(o.id), state);
  syncAxolotl(o.id, next);
  return { ok: true, from: prev.state, to: next, state };
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

module.exports = { getPlasticity, requestChange, STATES, TRANSITIONS };
