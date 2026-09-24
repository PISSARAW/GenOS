'use strict';

/**
 * Sensorium — état perceptif vivant par agent (G0/G3).
 * observations -> hypothèses -> focus -> affordances -> modèle d'environnement.
 */

const store = new Map();

function defaultSensorium(agentId) {
  return {
    agentId: String(agentId),
    sensors: [],
    activeFocus: null,
    observations: [],
    perceptualHypotheses: [],
    attentionBudget: 10,
    affordances: [],
    environmentModel: { landmarks: [], traces: [], uncertaintyMap: {} },
    revision: 0,
    updatedAt: new Date().toISOString()
  };
}

function createSensorium(opts) {
  const o = opts || {};
  if (!o.agentId) throw new Error('createSensorium requires agentId');
  const state = defaultSensorium(o.agentId);
  state.sensors = Array.isArray(o.sensors) ? [...o.sensors] : [];
  // Budget validé : jamais négatif (un budget négatif fausserait le focus).
  const budget = Number.isFinite(o.attentionBudget) ? o.attentionBudget : 10;
  if (budget < 0) throw new Error('createSensorium requires attentionBudget >= 0');
  state.attentionBudget = budget;
  store.set(String(o.agentId), state);
  return state;
}

function getSensorium(agentId) {
  if (!agentId) return null;
  return store.get(String(agentId)) || null;
}

function recordObservation(opts) {
  const o = opts || {};
  // Pas d'état fantôme : observer sans sensorium créé explicite retourne
  // null au lieu de fabriquer un état hors piste.
  const state = store.get(String(o.agentId));
  if (!state) return null;
  state.observations.push(o.observation);
  if (state.observations.length > 200) state.observations.shift();
  state.revision += 1;
  state.updatedAt = new Date().toISOString();
  store.set(String(o.agentId), state);
  return state;
}

function setFocus(opts) {
  const o = opts || {};
  // Idem : pas de création implicite hors createSensorium.
  const state = store.get(String(o.agentId));
  if (!state) return null;
  state.activeFocus = o.focus || null;
  state.revision += 1;
  state.updatedAt = new Date().toISOString();
  store.set(String(o.agentId), state);
  return state;
}

function clearSensorium(agentId) {
  if (agentId) store.delete(String(agentId));
  else store.clear();
}

module.exports = { createSensorium, getSensorium, recordObservation, setFocus, clearSensorium, defaultSensorium };
