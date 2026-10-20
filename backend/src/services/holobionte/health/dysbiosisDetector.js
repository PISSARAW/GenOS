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

function normalizeStatus(value) {
  return value === 'measured' ? 'measured' : 'heuristic';
}

function readNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) return null;
  return number;
}

function toSignalInput(value) {
  const isObject = Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const status = isObject ? normalizeStatus(value.status) : 'heuristic';
  const raw = isObject ? (value.value ?? value.measuredValue ?? value.score) : value;
  return { raw, status };
}

function readSignal(name, value) {
  const { raw, status } = toSignalInput(value);
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

function riskScore(signals) {
  const positivePressure = SIGNALS
    .filter((name) => name !== 'functionalRedundancy')
    .reduce((sum, name) => sum + signalValue(signals, name), 0);
  return Math.max(0, Math.min(1, (positivePressure - signalValue(signals, 'functionalRedundancy')) / 5));
}

function reasons(signals) {
  return SIGNALS.filter((name) => name === 'functionalRedundancy'
    ? signalValue(signals, name) <= THRESHOLDS.lowRedundancy
    : signalValue(signals, name) >= THRESHOLDS.signalExtreme);
}

function detectDysbiosis(input = {}) {
  const signals = readSignals(input);
  const score = riskScore(signals);
  const state = score >= THRESHOLDS.alertScore ? 'ALERT' : score >= THRESHOLDS.watchScore ? 'WATCH' : 'STABLE';
  const signalStatuses = Object.fromEntries(SIGNALS.map((name) => [name, signals[name].status]));
  return {
    score,
    state,
    signals,
    signalStatuses,
    signalStatus: signalStatuses,
    statuses: signalStatuses,
    status: 'heuristic',
    detectionStatus: 'heuristic',
    reasons: reasons(signals),
    automaticActionApplied: false
  };
}

module.exports = { SIGNALS, SIGNAL_STATUS_VALUES, THRESHOLDS, detectDysbiosis };