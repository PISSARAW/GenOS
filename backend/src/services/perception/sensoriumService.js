'use strict';

/**
 * Sensorium — état perceptif vivant par agent (G0/G3).
 * observations -> hypothèses -> focus -> affordances -> modèle d'environnement.
 */

const store = new Map();
const crypto = require('node:crypto');
const { EvidenceState } = require('../evidenceContractService');

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
  const observation = normalizeObservation(o.observation);
  if (!observation) return null;
  state.observations.push(observation);
  if (state.observations.length > 200) state.observations.shift();
  if (observation.provenance.state !== EvidenceState.REJECTED) updateEnvironmentModel(state, observation);
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
  state.activeFocus = o.focus ? {
    ...o.focus,
    selectedAt: new Date().toISOString(),
    evidenceRef: o.focus.evidenceRef || null
  } : null;
  state.revision += 1;
  state.updatedAt = new Date().toISOString();
  store.set(String(o.agentId), state);
  return state;
}

function clearSensorium(agentId) {
  if (agentId) store.delete(String(agentId));
  else store.clear();
}

function normalizeObservation(observation) {
  if (!observation || typeof observation !== 'object') return null;
  const source = { ...observation };
  const digest = observationDigest(source);
  const evidenceRef = source.evidenceRef || source.data?.evidenceRef || null;
  const evidenceState = source.evidenceState || source.provenance?.state
    || (source.synthetic === true ? EvidenceState.SYNTHETIC : evidenceRef ? EvidenceState.VERIFIED : EvidenceState.OBSERVED);
  if (!Object.values(EvidenceState).includes(evidenceState)) return null;
  if (evidenceState === EvidenceState.REJECTED && !source.rejectionReason) return null;
  return {
    ...source,
    provenance: {
      ...(source.provenance || {}),
      source: source.sensorId || 'unknown',
      observationDigest: digest,
      evidenceRef,
      state: evidenceState,
      verified: evidenceState === EvidenceState.VERIFIED
    }
  };
}

function observationDigest(observation) {
  return `sha256:${crypto.createHash('sha256').update(stableSerialize(observation), 'utf8').digest('hex')}`;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function updateEnvironmentModel(state, observation) {
  const target = observation.target || observation.data?.currentUrl;
  if (target && !state.environmentModel.landmarks.some(item => item.id === target)) {
    state.environmentModel.landmarks.push({ id: target, label: target, at: observation.at || new Date().toISOString() });
    if (state.environmentModel.landmarks.length > 100) state.environmentModel.landmarks.shift();
  }
  const gain = Number(observation.informationGain);
  if (Number.isFinite(gain)) {
    state.environmentModel.uncertaintyMap[target || 'global'] = Number((1 - gain).toFixed(4));
  }
}

function snapshotSensorium(agentId) {
  const state = getSensorium(agentId);
  if (!state) return null;
  return JSON.parse(JSON.stringify(state));
}

module.exports = {
  createSensorium, getSensorium, recordObservation, setFocus, clearSensorium,
  defaultSensorium, normalizeObservation, observationDigest, snapshotSensorium
};
