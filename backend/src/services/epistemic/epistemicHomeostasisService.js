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
  if (!input || typeof input !== 'object') return 0;
  const budget = Number(input.budgetRemaining);
  const reference = Number(input.budgetReference) || 1;
  if (!isFinite(budget) || budget < 0) return 0.5;
  if (reference <= 0) return 0;
  return clampAt(Math.max(0, 1 - budget / reference), 0, 1);
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

  const wRisk = Number(weights.risk || 0);
  const wUnc = Number(weights.uncertainty || 0);
  const wCon = Number(weights.contradiction || 0);
  const wNov = Number(weights.novelty || 0);
  const wEv = Number(weights.evidence || 0);
  const wCost = Number(weights.cost || 0);
  const total = wRisk + wUnc + wCon + wNov + wEv + wCost || 1;

  const pressure = (
    wRisk * risk +
    wUnc * uncertainty +
    wCon * contradiction +
    wNov * novelty +
    wEv * evidence +
    wCost * cost
  ) / total;

  return clampAt(isFinite(pressure) ? pressure : 0, 0, 1);
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
};
