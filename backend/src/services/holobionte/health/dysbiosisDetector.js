'use strict';

const SIGNALS = Object.freeze([
  'resourceConcentration', 'dependencyConcentration', 'harmfulActivity',
  'conflictRate', 'immunePressure', 'functionalRedundancy'
]);

function invalid(message) {
  return Object.assign(new Error(message), { code: 'HOLOBIONT_DYSBIOSIS_INVALID' });
}

function readSignals(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('signals must be an object.');
  const signals = {};
  for (const name of SIGNALS) {
    const value = Number(input[name]);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw invalid(`${name} must be between 0 and 1.`);
    signals[name] = value;
  }
  return signals;
}

function riskScore(signals) {
  const positivePressure = signals.resourceConcentration + signals.dependencyConcentration
    + signals.harmfulActivity + signals.conflictRate + signals.immunePressure;
  return Math.max(0, Math.min(1, (positivePressure - signals.functionalRedundancy) / 5));
}

function reasons(signals) {
  return SIGNALS.filter((name) => name === 'functionalRedundancy'
    ? signals[name] <= 0.25 : signals[name] >= 0.7);
}

function detectDysbiosis(input = {}) {
  const signals = readSignals(input);
  const score = riskScore(signals);
  return {
    score,
    state: score >= 0.6 ? 'ALERT' : score >= 0.35 ? 'WATCH' : 'STABLE',
    signals,
    reasons: reasons(signals),
    automaticActionApplied: false
  };
}

module.exports = { SIGNALS, detectDysbiosis };
