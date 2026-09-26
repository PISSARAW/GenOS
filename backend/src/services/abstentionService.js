'use strict';

/**
 * Opt-out calibré générique (métacognition).
 *
 * Règle de décision explicite et testable : s'abstenir (escalader vers
 * preuve/humain) plutôt que confabuler quand l'état calibré l'exige.
 * Frontières alignées sur selfModelService.decisionPolicy (cautious) :
 * plancher de confiance 0.5, plafond d'incertitude 0.8, plancher
 * d'intégrité 0.6. Sans données : 'unassessed', on procède (documenté).
 * applyAbstention donne des dents au verdict : evidence requise avant
 * promotion + resserrement de requireIndependentEvidence (gate auto).
 */

const DEFAULT_FLOOR = 0.5;
const UNCERTAINTY_CEILING = 0.8;
const INTEGRITY_FLOOR = 0.6;
const HIGH_UNCERTAINTY = 0.5;

function floorOf(input) {
  const floor = Number(input.floor);
  return Number.isFinite(floor) ? floor : DEFAULT_FLOOR;
}

function evaluateAbstention(input) {
  const data = input || {};
  const confidence = Number(data.confidence);
  const uncertainty = Number(data.uncertainty);
  const integrity = Number(data.integrity);
  const base = { abstain: false, reason: null, margin: null, confidence, uncertainty, threshold: floorOf(data) };
  if (Number.isFinite(integrity) && integrity < INTEGRITY_FLOOR) {
    return { ...base, abstain: true, reason: 'integrity_below_floor' };
  }
  if (Number.isFinite(uncertainty) && uncertainty >= UNCERTAINTY_CEILING) {
    return { ...base, abstain: true, reason: 'uncertainty_ceiling' };
  }
  if (Number.isFinite(confidence) && Number.isFinite(uncertainty)
    && confidence < base.threshold && uncertainty >= HIGH_UNCERTAINTY) {
    return { ...base, abstain: true, reason: 'low_confidence_high_uncertainty' };
  }
  if (!Number.isFinite(confidence) || !Number.isFinite(uncertainty)) return { ...base, reason: 'unassessed' };
  return { ...base, reason: 'proceed', margin: Math.min(confidence - base.threshold, UNCERTAINTY_CEILING - uncertainty) };
}

function applyAbstention(mission, verdict) {
  if (!mission || !verdict) return verdict;
  if (verdict.abstain) {
    mission.abstentionRecommended = {
      reason: verdict.reason,
      confidence: verdict.confidence,
      uncertainty: verdict.uncertainty,
      at: new Date().toISOString()
    };
    mission.requiresEvidenceBeforePromotion = true;
  }
  return verdict;
}

module.exports = { evaluateAbstention, applyAbstention, DEFAULT_FLOOR, UNCERTAINTY_CEILING, INTEGRITY_FLOOR };
