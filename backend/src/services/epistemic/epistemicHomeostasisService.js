'use strict';

/**
 * Epistemic homeostasis service.
 *
 * Computes the assurance pressure for a claim from risk, uncertainty,
 * contradiction, novelty, cost and evidence. The pressure determines which
 * verification tier should be recruited, without a hard-wired gate table.
 *
 * Invariant: higher pressure must not decrease the recruited effort.
 */

const EPSILON = 1e-6;

function clampAt(x, min, max) {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function normalizeRisk(input) {
  const raw = Number(input && typeof input.risk === 'object' && input.risk !== null ? input.risk.score : 0);
  return clampAt(isFinite(raw) ? raw : 0, 0, 1);
}

function normalizeContradiction(input) {
  if (!input || typeof input !== 'object') return 0;
  const signals = input.contradictions;
  if (!Array.isArray(signals)) return 0;
  return clampAt(signals.reduce((sum, item) => {
    const w = Number(item && item.weight);
    return sum + (isFinite(w) ? w : 0);
  }, 0), 0, 1);
}

function normalizeUncertainty(input) {
  if (!input || typeof input !== 'object') return 0;
  const domain = input.validityDomain;
  if (!domain || typeof domain !== 'object') return 0;
  const covered = Number(domain.coverage || 0);
  const total = Number(domain.constraints || 0);
  if (!isFinite(covered) || !isFinite(total) || total <= 0) return 0.5;
  return clampAt(1 - covered / total, 0, 1);
}

function normalizeNovelty(input) {
  if (!input || typeof input !== 'object') return 0;
  const novelty = input.novelty;
  if (typeof novelty === 'number' && isFinite(novelty)) return clampAt(novelty, 0, 1);
  const subject = (input.subject || '').toString();
  const known = input.knownSubjects;
  if (!Array.isArray(known) || !known.length) return 1;
  return known.includes(subject) ? 0 : 0.75;
}

function normalizeEvidence(input) {
  if (!input || typeof input !== 'object') return 1;
  const evidence = input.evidence;
  if (!Array.isArray(evidence) || !evidence.length) return 1;
  const quality = evidence.reduce((sum, item) => {
    const q = Number(item && item.quality);
    return sum + (isFinite(q) ? q : 0);
  }, 0) / evidence.length;
  return clampAt(1 - quality, 0, 1);
}

function normalizeCost(input) {
  // Le coût ne doit pas créer de boucle positive :
  // un budget faible ne doit pas augmenter la pression.
  // Au contraire, un budget faible doit réduire l'effort disponible.
  // Donc cost = 0 quand le budget est suffisant, et cost = 1 seulement quand
  // le budget est épuisé et qu'on doit escalader (pas vérifier davantage).
  if (!input || typeof input !== 'object') return 0;
  const budget = Number(input.budgetRemaining);
  if (!isFinite(budget) || budget < 0) return 0;
  if (budget === 0) return 1; // échec → escalade, pas vérification
  return 0; // budget suffisant → pas de pression liée au coût
}

const DEFAULT_WEIGHTS = Object.freeze({
  risk: 0.35,
  uncertainty: 0.2,
  contradiction: 0.2,
  novelty: 0.1,
  evidence: 0.1,
  cost: 0.05,
});

function computePressure(input, weights = DEFAULT_WEIGHTS) {
  const risk = normalizeRisk(input);
  const uncertainty = normalizeUncertainty(input);
  const contradiction = normalizeContradiction(input);
  const novelty = normalizeNovelty(input);
  const evidence = normalizeEvidence(input);
  const cost = normalizeCost(input);

  const total = totalWeights(weights);
  if (total === 0) return 0;

  const pressure = (
    (weights.risk || 0) * risk +
    (weights.uncertainty || 0) * uncertainty +
    (weights.contradiction || 0) * contradiction +
    (weights.novelty || 0) * novelty +
    (weights.evidence || 0) * evidence +
    (weights.cost || 0) * cost
  ) / total;

  return clampAt(isFinite(pressure) ? pressure : 0, 0, 1);
}

function totalWeights(weights) {
  const keys = ['risk', 'uncertainty', 'contradiction', 'novelty', 'evidence', 'cost'];
  return keys.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0) || 1;
}

function tierFromPressure(pressure) {
  if (pressure < 0.25) return 'baseline';
  if (pressure < 0.5) return 'lean';
  if (pressure < 0.7) return 'adaptive';
  if (pressure < 0.9) return 'inflamed';
  return 'systemic';
}

function feedbackEffect(pressure, previousPressure, evidenceDelta) {
  const positive = Math.max(0, pressure - previousPressure);
  const negative = Math.max(0, previousPressure - pressure);
  const evidenceGain = Math.max(0, evidenceDelta || 0);
  if (evidenceGain > 0.15 && negative > 0) {
    return Math.max(0, pressure - Math.min(negative, evidenceGain * 0.5));
  }
  return pressure + positive * 0.5;
}

module.exports = {
  DEFAULT_WEIGHTS,
  computePressure,
  tierFromPressure,
  feedbackEffect,
  normalizeRisk,
  normalizeUncertainty,
  normalizeContradiction,
  normalizeNovelty,
  normalizeEvidence,
  normalizeCost,
  totalWeights,
};
