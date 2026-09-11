/**
 * Biomimetic Signaling Bus for Zero-Text Inter-Agent Communication
 *
 * Replaces verbose natural language prompts and JSON exchanges with
 * sub-symbolic, physico-chemical biological primitives:
 * 1. Paracrine Ligands & Receptor Cascades (molecular activation)
 * 2. Electrocyte Membrane Potentials & Kuramoto Phase (instant consensus)
 * 3. Stigmergic Pheromones (chemotactic environmental routing)
 * 4. Plasmids (horizontal gene transfer of binary capabilities)
 * 5. Latent Tensors (dense embedding vectors)
 */

const { packBioPolymer, unpackBioPolymer } = require('./bioPolymerPersistenceService');

const SIGNAL_TYPES = Object.freeze({
  LIGAND: 'ligand',
  VOLTAGE: 'voltage',
  PHEROMONE: 'pheromone',
  PLASMID: 'plasmid',
  TENSOR: 'tensor',
  TEXT: 'text'
});

const DEFAULT_VOLTAGE_THRESHOLD_MV = 300.0;

function isSupportedSignalType(type) {
  const norm = String(type || '').trim().toLowerCase();
  return Object.values(SIGNAL_TYPES).includes(norm);
}

function packSignalPayload(signalType, signalData) {
  if (signalType === SIGNAL_TYPES.TEXT) {
    return null;
  }
  return packBioPolymer(signalData || {});
}

function unpackSignalPayload(rawBlob, signalType, fallbackJson) {
  if (rawBlob) {
    return unpackBioPolymer(rawBlob);
  }
  if (fallbackJson && signalType !== SIGNAL_TYPES.TEXT) {
    return unpackBioPolymer(fallbackJson);
  }
  return null;
}

function evaluateLigandReactivity(ligandData, receptor) {
  if (!ligandData || !receptor) return { triggered: false, reason: 'INVALID_INPUT' };
  const nameMatch = ligandData.ligand === receptor.targetLigand;
  const conc = Number(ligandData.concentration || 0);
  const thresh = Number(receptor.threshold || 0);
  const triggered = nameMatch && conc >= thresh;
  return {
    triggered,
    cascadeSignal: triggered ? receptor.cascadeSignal : null,
    delta: conc - thresh
  };
}

function evaluateKuramotoOrder(phaseAngles = []) {
  if (!phaseAngles.length) return 0.0;
  let sumCos = 0;
  let sumSin = 0;
  for (const theta of phaseAngles) {
    sumCos += Math.cos(theta);
    sumSin += Math.sin(theta);
  }
  const n = phaseAngles.length;
  return Math.sqrt((sumCos / n) ** 2 + (sumSin / n) ** 2);
}

function evaluateElectrocyteConsensus(discharges = [], options = {}) {
  const threshold = Number(options.thresholdMv || DEFAULT_VOLTAGE_THRESHOLD_MV);
  let totalMv = 0;
  const phases = [];

  for (const d of discharges) {
    totalMv += Number(d.voltageMv || 0);
    if (d.phaseAngle !== undefined) {
      phases.push(Number(d.phaseAngle));
    }
  }

  const orderParameter = evaluateKuramotoOrder(phases);
  const reached = totalMv >= threshold && (phases.length === 0 || orderParameter >= 0.70);

  return {
    consensusReached: reached,
    totalVoltageMv: Number(totalMv.toFixed(2)),
    thresholdMv: threshold,
    kuramotoOrder: Number(orderParameter.toFixed(3)),
    participantCount: discharges.length
  };
}

function computeChemotacticGradient(pheromones = [], locusHash) {
  const matching = pheromones.filter((p) => p.locusHash === locusHash);
  if (!matching.length) return 0.0;
  let netIntensity = 0;
  for (const p of matching) {
    const intensity = Number(p.intensity || 0);
    netIntensity += p.isRepellent ? -intensity : intensity;
  }
  return Number(netIntensity.toFixed(3));
}

function formatSignalForTransport(params) {
  const { signalType, signalData, contentFallback } = params;
  const normType = String(signalType || SIGNAL_TYPES.TEXT).trim().toLowerCase();
  const packedBlob = packSignalPayload(normType, signalData);
  const textContent = contentFallback || (normType === SIGNAL_TYPES.TEXT ? JSON.stringify(signalData || {}) : `[BIO_SIGNAL:${normType}]`);
  return {
    signalType: normType,
    signalBlob: packedBlob,
    content: textContent
  };
}

module.exports = {
  SIGNAL_TYPES,
  isSupportedSignalType,
  packSignalPayload,
  unpackSignalPayload,
  evaluateLigandReactivity,
  evaluateKuramotoOrder,
  evaluateElectrocyteConsensus,
  computeChemotacticGradient,
  formatSignalForTransport
};
