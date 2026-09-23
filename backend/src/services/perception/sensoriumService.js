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
  state.attentionBudget = Number.isFinite(o.attentionBudget) ? o.attentionBudget : 10;
  store.set(String(o.agentId), state);
  return state;
}

function getSensorium(agentId) {
  if (!agentId) return null;
  return store.get(String(agentId)) || null;
}

function recordObservation(opts) {
  const o = opts || {};
  const state = store.get(String(o.agentId)) || defaultSensorium(o.agentId);
  state.observations.push(o.observation);
  if (state.observations.length > 200) state.observations.shift();
  state.revision += 1;
  state.updatedAt = new Date().toISOString();
  store.set(String(o.agentId), state);
  return state;
}

function setFocus(opts) {
  const o = opts || {};
  const state = store.get(String(o.agentId)) || defaultSensorium(o.agentId);
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
