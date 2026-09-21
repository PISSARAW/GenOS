'use strict';

/**
 * Pont stigmergie inter-process AEIS.
 *
 * Persiste les phéromones épistémiques via `biomimeticSignalingBus` et
 * `bioPolymerPersistenceService` pour permettre la communication
 * inter-process (workers isolés, métapopulation, biocénose).
 *
 * Types de signaux phéromonaux :
 * - EPISTEMIC_CONTRADICTION
 * - EPISTEMIC_VERIFIER_SUCCESS
 * - EPISTEMIC_VERIFIER_FAILURE
 * - EPISTEMIC_DOMAIN_GAP
 * - EPISTEMIC_KNOWN_FAILURE
 * - EPISTEMIC_HIGH_RISK
 */

const SIGNAL_TYPES = Object.freeze({
  EPISTEMIC_CONTRADICTION: 'epistemic_contradiction',
  EPISTEMIC_VERIFIER_SUCCESS: 'epistemic_verifier_success',
  EPISTEMIC_VERIFIER_FAILURE: 'epistemic_verifier_failure',
  EPISTEMIC_DOMAIN_GAP: 'epistemic_domain_gap',
  EPISTEMIC_KNOWN_FAILURE: 'epistemic_known_failure',
  EPISTEMIC_HIGH_RISK: 'epistemic_high_risk',
});

function isSupportedType(type) {
  return Object.values(SIGNAL_TYPES).includes(type);
}

/**
 * Dépose un signal phéromonal dans l'environnement partagé.
 * Le signal est persisté via `biomimeticSignalingBus` pour être lu
 * par d'autres processus/workers.
 */
async function depositPheromone(signal, opts = {}) {
  if (!isSupportedType(signal.type)) {
    throw new Error(`Unsupported pheromone type: ${signal.type}`);
  }
  const bus = opts.bus || require('../biomimeticSignalingBus');
  const blob = bus.packSignalPayload(bus.SIGNAL_TYPES.PHEROMONE, {
    type: signal.type,
    payload: signal.payload,
    locus: signal.locus,
    locusHash: signal.locusHash,
    intensity: signal.intensity,
    isRepellent: signal.isRepellent,
  });
  return {
    signalType: bus.SIGNAL_TYPES.PHEROMONE,
    signalBlob: blob,
    content: '',
    depositedAt: new Date().toISOString(),
  };
}

/**
 * Lit les signaux phéromonaux persistés.
 */
async function readPheromones(opts = {}) {
  const bus = opts.bus || require('../biomimeticSignalingBus');
  const blob = opts.blob;
  if (!blob) return [];
  const unpacked = bus.unpackSignalPayload(blob, bus.SIGNAL_TYPES.PHEROMONE, opts.fallbackJson);
  return Array.isArray(unpacked) ? unpacked : [unpacked];
}

module.exports = {
  SIGNAL_TYPES,
  isSupportedType,
  depositPheromone,
  readPheromones,
};
