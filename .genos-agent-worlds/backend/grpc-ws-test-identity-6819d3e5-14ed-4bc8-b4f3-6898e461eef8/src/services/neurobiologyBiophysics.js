/**
 * neurobiologyBiophysics.js
 * 
 * Biophysical calculations aligned with the Rust genos-biology engine:
 * 1. Rall electrotonic cable attenuation: V(x) = V0 * exp(-x / lambda)
 * 2. NMDA supralinear dendritic spike triggering
 * 3. Canonical mapping of dendritic compartments and spine morphologies
 */

const COMPARTMENT_CANONICAL = {
  soma: 'Soma',
  proximaltrunk: 'ProximalTrunk',
  proximal_trunk: 'ProximalTrunk',
  trunk: 'ProximalTrunk',
  proximal: 'ProximalTrunk',
  apicaldendrite: 'ApicalDendrite',
  apical_dendrite: 'ApicalDendrite',
  apical: 'ApicalDendrite',
  basaldendrite: 'BasalDendrite',
  basal_dendrite: 'BasalDendrite',
  basal: 'BasalDendrite',
  distaltuft: 'DistalTuft',
  distal_tuft: 'DistalTuft',
  tuft: 'DistalTuft',
  distal: 'DistalTuft'
};

const SPINE_CANONICAL = {
  filopodia: 'Filopodia',
  thin: 'Thin',
  stubby: 'Stubby',
  mushroom: 'Mushroom'
};

/**
 * Calculates electrotonic cable attenuation according to Rall's cable theory:
 * V(x) = V0 * exp(-x / lambda)
 * 
 * @param {number} v0 - Initial post-synaptic potential (mV or relative amplitude)
 * @param {number} electrotonicDist - Normalized electrotonic distance (x)
 * @param {number} lambda - Space constant (default: 1.0)
 * @returns {number} Attenuated voltage at soma
 */
function calculateRallAttenuation(v0 = 1.0, electrotonicDist = 0.0, lambda = 1.0) {
  const v = Number(v0) || 0.0;
  const x = Math.max(0.0, Number(electrotonicDist) || 0.0);
  const l = Math.max(0.001, Number(lambda) || 1.0);
  return Number((v * Math.exp(-x / l)).toFixed(6));
}

/**
 * Computes non-linear NMDA spike amplification when coincident dendritic input
 * breaches the local threshold.
 * 
 * @param {number} attenuatedVoltage - Voltage reaching the branch
 * @param {number} receptorDensity - NMDA receptor density (default: 1.0)
 * @param {number} spikeThreshold - Threshold for supralinear activation (default: 1.2)
 * @returns {{ voltage: number, isNmdaSpike: boolean }}
 */
function evaluateNmdaSpike(attenuatedVoltage = 1.0, receptorDensity = 1.0, spikeThreshold = 1.2) {
  const v = Number(attenuatedVoltage) || 0.0;
  const density = Math.max(0.0, Number(receptorDensity) || 1.0);
  const effectiveVoltage = v * (0.8 + 0.2 * density);

  if (effectiveVoltage >= spikeThreshold) {
    // Non-linear all-or-none supralinear boost (NMDA spike)
    return {
      voltage: Number((effectiveVoltage * 1.85).toFixed(4)),
      isNmdaSpike: true
    };
  }

  return {
    voltage: Number(effectiveVoltage.toFixed(4)),
    isNmdaSpike: false
  };
}

/**
 * Normalizes compartment string to canonical Rust enum representation
 */
function normalizeCompartment(name = 'soma') {
  const clean = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  return COMPARTMENT_CANONICAL[clean] || 'ApicalDendrite';
}

/**
 * Normalizes spine morphology string to canonical Rust enum representation
 */
function normalizeSpineMorphology(name = 'thin') {
  const clean = String(name || '').toLowerCase().trim();
  return SPINE_CANONICAL[clean] || 'Thin';
}

module.exports = {
  calculateRallAttenuation,
  evaluateNmdaSpike,
  normalizeCompartment,
  normalizeSpineMorphology
};
