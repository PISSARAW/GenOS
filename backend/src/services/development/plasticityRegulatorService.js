'use strict';

/**
 * PlasticityRegulator (G12) : remplace l'Axolotl 2 états par 6 états
 * avec hystérésis, cooldown, budget de changement, réversibilité.
 * Façade compatible avec axolotlTopologyService.
 */

const STATES = ['NEOTENIC', 'PLASTIC', 'DIFFERENTIATING', 'CONSOLIDATING', 'STABLE', 'EMERGENCY_PLASTIC'];

const store = new Map();
const COOLDOWN_MS = 30000;

function getPlasticity(id) {
  if (!id) return null;
  return store.get(String(id)) || { id: String(id), state: 'NEOTENIC', changes: 0, budget: 10, lastChangeAt: null };
}

function requestChange(opts) {
  const o = opts || {};
  const prev = getPlasticity(o.id);
  if (prev.budget <= 0) return { ok: false, reason: 'change_budget_exhausted' };
  if (cooldownActive(prev)) return { ok: false, reason: 'cooldown_active' };
  const next = STATES.includes(o.to) ? o.to : 'PLASTIC';
  const state = { ...prev, state: next, changes: prev.changes + 1, budget: prev.budget - 1, lastChangeAt: Date.now() };
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

module.exports = { getPlasticity, requestChange, STATES };
