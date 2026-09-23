'use strict';

/**
 * Daemon Natural Search Adapter — ADR 0034 D7.
 *
 * Les daemons deviennent un NOUVEAU MILIEU pour Natural Search,
 * pas un nouveau moteur : cet adaptateur traduit uniquement
 *   observation territoriale → hypothesis du ledger,
 *   signaux territoriaux → pression de recherche.
 * Zéro moteur dupliqué (pas de daemonHypothesisEngine, pas de
 * daemonDeadEndMemory). Le ledger et le modèle restent injectés :
 * l'adaptateur ne possède aucun état.
 *
 * Règle d'indépendance : observationHash() identifie une
 * observation ; deux réflexions sur la même observation ne
 * créent pas deux preuves (l'investigateur D8 dérive l'id du
 * finding de ce hash → ON CONFLICT DO NOTHING).
 */

const crypto = require('node:crypto');

function observationHash(observation) {
  const parts = [
    observation.territoryId || '',
    observation.headSha || '',
    observation.detectorId || '',
    (observation.scope && observation.scope.type) || '',
    (observation.scope && observation.scope.value) || '',
    observation.claim || ''
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function buildHypothesisInput(observation) {
  const scope = observation.scope || {};
  return {
    agentId: observation.daemonId || 'daemon.resident',
    statement: observation.claim,
    prediction: scope.value ? `observable at ${scope.type}:${scope.value}` : null,
    falsificationCondition: observation.falsification || 'contradicting observation on the same scope',
    prior: 0.4,
    observationHash: observationHash(observation),
    territoryId: observation.territoryId,
    headSha: observation.headSha
  };
}

function validateObservation(observation) {
  if (!observation || typeof observation !== 'object') return false;
  if (!observation.claim || !observation.territoryId) return false;
  return true;
}

function proposeFromObservation(ledger, observation) {
  if (!ledger || !validateObservation(observation)) return { proposed: false, reason: 'invalid-observation' };
  try {
    const input = buildHypothesisInput(observation);
    const hypothesis = ledger.propose(input);
    return { proposed: true, hypothesisId: hypothesis.id, status: hypothesis.status, observationHash: input.observationHash };
  } catch (error) {
    return { proposed: false, reason: error.message };
  }
}

function mapTerritoryToPressure(signals) {
  const s = signals || {};
  return {
    stepsSinceProgress: Number(s.repeatedFailures || 0),
    falsifiedHypotheses: Number(s.refutedFindings || 0),
    contradictions: Number(s.contradictingEvidence || 0)
  };
}

function reportTerritoryPressure(model, signals) {
  if (!model) return { reported: false, reason: 'no-model' };
  try {
    const report = model.update(mapTerritoryToPressure(signals));
    return { reported: true, ...report };
  } catch (error) {
    return { reported: false, reason: error.message };
  }
}

module.exports = {
  observationHash,
  buildHypothesisInput,
  proposeFromObservation,
  mapTerritoryToPressure,
  reportTerritoryPressure
};
