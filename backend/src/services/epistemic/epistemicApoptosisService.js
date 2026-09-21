'use strict';

/**
 * Epistemic apoptosis.
 *
 * Un agent accumule une dissonance épistémique depuis les signaux du
 * système immunitaire et passe par des seuils graduels avant terminaison.
 */

const NIVEAUX = Object.freeze({
  baseline: 0,
  warning: 1,
  reduced_authority: 2,
  quarantine: 3,
  apoptosis: 4,
});

const SEUILS = Object.freeze({
  warning: 5,
  reduced_authority: 15,
  quarantine: 30,
  apoptosis: 50,
});

function dissonanceFrom(signals) {
  if (!Array.isArray(signals)) return 0;
  return signals.reduce((sum, s) => sum + (typeof s !== 'number' ? 1 : s), 0);
}

function niveauCorpsent(cumul) {
  if (cumul >= SEUILS.apoptosis) return NIVEAUX.apoptosis;
  if (cumul >= SEUILS.quarantine) return NIVEAUX.quarantine;
  if (cumul >= SEUILS.reduced_authority) return NIVEAUX.reduced_authority;
  if (cumul >= SEUILS.warning) return NIVEAUX.warning;
  return NIVEAUX.baseline;
}

function accumulate(agent, newSignals) {
  const d = dissonanceFrom(newSignals);
  const prev = agent.epistemicDissonance || 0;
  const after = prev + d;
  return {
    ...agent,
    epistemicDissonance: after,
    lastDissonanceDelta: d,
    lastUpdate: new Date().toISOString(),
    statusLevel: niveauCorpsent(after),
  };
}

function peutApoptoser(agent, seuilOverride = null) {
  const seuil = seuilOverride != null ? seuilOverride : SEUILS.apoptosis;
  return (agent.epistemicDissonance || 0) >= seuil;
}

function apoptose(agent) {
  return {
    ...agent,
    status: 'apoptotique',
    statusLevel: NIVEAUX.apoptosis,
    terminatedAt: new Date().toISOString(),
    epistemicDissonance: agent.epistemicDissonance || 0,
  };
}

function autopsy(agent, causeSignature, observations = []) {
  return {
    subject: agent.id || agent.name || 'agent',
    causeSignature,
    observations,
    epistemicDissonanceAtDeath: agent.epistemicDissonance || 0,
    terminatedAt: agent.terminatedAt || new Date().toISOString(),
    autopsySignature: causeSignature ? require('../epistemic/immuneMemoryService').signatureFrom(causeSignature) : null,
  };
}

module.exports = {
  NIVEAUX,
  SEUILS,
  dissonanceFrom,
  niveauCorpsent,
  accumulate,
  peutApoptoser,
  apoptose,
  autopsy,
};
