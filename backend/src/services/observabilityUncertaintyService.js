'use strict';

/**
 * Incertitude d'observabilité : `missing_observability_increases_uncertainty`.
 *
 * La télémétrie manquante signifie inconnu, jamais sain.
 * Couverture = delivered / (delivered + dropped + errors + blindSpots).
 * Incertitude ajustée = base + (1 - base) * (1 - couverture).
 * Résultat borné dans [0, 1], monotone en couverture.
 */

function safeInput(input) {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object') return {};
  return input;
}

function numOf(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function coverageFromHealth(input) {
  const source = safeInput(input);
  const delivered = Math.max(0, numOf(source.delivered, 0));
  const dropped = Math.max(0, numOf(source.dropped ?? source.droppedEvents, 0));
  const errors = Math.max(0, numOf(source.errors ?? source.persistenceErrors, 0));
  const spots = Array.isArray(source.blindSpots) ? source.blindSpots.length : numOf(source.blindSpots, 0);
  const missing = dropped + errors + Math.max(0, spots);
  const total = delivered + missing;
  if (total <= 0) return 1;
  return clamp01(delivered / total);
}

function inflateUncertainty(input) {
  const source = safeInput(input);
  const base = clamp01(numOf(source.base ?? source.uncertainty, 0));
  const coverage = coverageFromHealth(source.health || source);
  return clamp01(base + (1 - base) * (1 - coverage));
}

function pressureWithObservability(input) {
  const source = safeInput(input);
  const epistemic = safeInput(source.epistemic);
  const adjusted = inflateUncertainty({
    base: epistemic.uncertainty,
    health: source.health
  });
  return {
    uncertainty: adjusted,
    contradiction: numOf(epistemic.contradiction, 0),
    evidenceDeficit: numOf(epistemic.evidenceDeficit, 0),
    observabilityCoverage: coverageFromHealth(source.health)
  };
}

module.exports = {
  coverageFromHealth,
  inflateUncertainty,
  pressureWithObservability
};
