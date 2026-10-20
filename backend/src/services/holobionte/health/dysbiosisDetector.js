'use strict';

const SIGNALS = Object.freeze([
  'resourceConcentration', 'dependencyConcentration', 'harmfulActivity',
  'conflictRate', 'immunePressure', 'functionalRedundancy'
]);

const SIGNAL_STATUS_VALUES = Object.freeze(['measured', 'heuristic']);

const THRESHOLDS = Object.freeze({
  signalExtreme: 0.7,
  lowRedundancy: 0.25,
  watchScore: 0.35,
  alertScore: 0.6
});

function invalid(message) {
  return Object.assign(new Error(message), { code: 'HOLOBIONT_DYSBIOSIS_INVALID' });
}

function normalizeStatus(value, name) {
  if (value === undefined) return 'heuristic';
  if (!SIGNAL_STATUS_VALUES.includes(value)) {
    throw invalid(`${name}.status must be measured or heuristic.`);
  }
  return value;
}

function readNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) return null;
  return number;
}

function toSignalInput(name, value) {
  const isObject = Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const status = isObject ? normalizeStatus(value.status, name) : 'heuristic';
  const raw = isObject ? (value.value ?? value.measuredValue ?? value.score) : value;
  return { raw, status };
}

function readSignal(name, value) {
  const { raw, status } = toSignalInput(name, value);
  const number = readNumber(raw);
  if (number === null) throw invalid(`${name} must be between 0 and 1.`);
  return { value: number, status };
}

function readSignals(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('signals must be an object.');
  const signals = {};
  for (const name of SIGNALS) {
    signals[name] = readSignal(name, input[name]);
  }
  return signals;
}

function signalValue(signals, name) {
  return signals[name].value;
}

function readThreshold(name, value) {
  const number = readNumber(value);
  if (number === null) throw invalid(`${name} threshold must be between 0 and 1.`);
  return number;
}

function normalizeThresholds(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('thresholds must be an object.');
  }
  const thresholds = {};
  for (const [name, fallback] of Object.entries(THRESHOLDS)) {
    thresholds[name] = readThreshold(name, input[name] ?? fallback);
  }
  if (thresholds.watchScore >= thresholds.alertScore) {
    throw invalid('watchScore threshold must be lower than alertScore threshold.');
  }
  return thresholds;
}

function riskScore(signals) {
  const positivePressure = SIGNALS
    .filter((name) => name !== 'functionalRedundancy')
    .reduce((sum, name) => sum + signalValue(signals, name), 0);
  return Math.max(0, Math.min(1, (positivePressure - signalValue(signals, 'functionalRedundancy')) / 5));
}

function reasons(signals, thresholds) {
  return SIGNALS.filter((name) => name === 'functionalRedundancy'
    ? signalValue(signals, name) <= thresholds.lowRedundancy
    : signalValue(signals, name) >= thresholds.signalExtreme);
}

function detectDysbiosis(input = {}, thresholdOverrides = {}) {
  const signals = readSignals(input);
  const thresholds = normalizeThresholds(thresholdOverrides);
  const score = riskScore(signals);
  const state = score >= thresholds.alertScore ? 'ALERT' : score >= thresholds.watchScore ? 'WATCH' : 'STABLE';
  const signalStatuses = Object.fromEntries(SIGNALS.map((name) => [name, signals[name].status]));
  const measurementStatus = SIGNALS.every((name) => signalStatuses[name] === 'measured')
    ? 'measured' : 'heuristic';
  return {
    score,
    state,
    signals,
    thresholds,
    signalStatuses,
    signalStatus: signalStatuses,
    statuses: signalStatuses,
    status: 'heuristic',
    detectionStatus: 'heuristic',
    measurementStatus,
    reasons: reasons(signals, thresholds),
    automaticActionApplied: false,
    promotionEligible: false,
    promotionReason: 'HEURISTIC_SCORE_REQUIRES_INDEPENDENT_EVIDENCE'
  };
}

module.exports = { SIGNALS, SIGNAL_STATUS_VALUES, THRESHOLDS, normalizeThresholds, detectDysbiosis };
