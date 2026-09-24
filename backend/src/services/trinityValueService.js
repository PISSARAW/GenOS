'use strict';

const SIGNALS = ['domainUncertainty', 'errorCost', 'irreversibility', 'oracleAvailability'];

function finiteSignal(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function calculateEvIndex(input = {}) {
  const signals = Object.fromEntries(SIGNALS.map((key) => [key, finiteSignal(input[key])]));
  const budgetRatio = Number(input.budgetRatio);
  const hypothesisCount = finiteSignal(input.hypothesisCount);
  const missing = [...SIGNALS.filter((key) => signals[key] === null)];
  if (!Number.isFinite(budgetRatio) || budgetRatio < 0 || hypothesisCount === null) missing.push('budgetRatio/hypothesisCount');
  if (missing.length) return { evIndex: null, eligible: false, missing, correlationSource: null };
  const correlation = finiteSignal(input.errorCorrelation) ?? 0.5;
  const evIndex = clamp01(
    0.20 * hypothesisCount + 0.15 * signals.domainUncertainty + 0.20 * signals.errorCost
    + 0.15 * signals.irreversibility + 0.15 * signals.oracleAvailability
    + 0.10 * (1 - correlation) - 0.15 * budgetRatio
  );
  return {
    evIndex: Number(evIndex.toFixed(4)),
    eligible: evIndex >= 0.5 && budgetRatio <= 1,
    missing: [],
    signals: { ...signals, hypothesisCount, errorCorrelation: correlation, budgetRatio },
    correlationSource: finiteSignal(input.errorCorrelation) === null ? 'policy_prior' : 'historical'
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

module.exports = { calculateEvIndex };
