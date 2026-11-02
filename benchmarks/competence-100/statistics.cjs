'use strict';

const protocol = require('./protocol.json');
const ALPHA = protocol.familywiseAlpha / protocol.simultaneousBounds;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function pairedBound(differences) {
  const gain = mean(differences);
  if (gain === null) return { n: 0, gain: null, lower: null };
  return { n: differences.length, gain,
    lower: Math.max(-1, gain - Math.sqrt(2 * Math.log(1 / ALPHA) / differences.length)) };
}

function binomialTail(n, successes, p) {
  if (p === 0) return successes <= 0 ? 1 : 0;
  if (p === 1) return 1;
  let term = (1 - p) ** n;
  let tail = successes === 0 ? term : 0;
  for (let k = 1; k <= n; k++) {
    term *= ((n - k + 1) / k) * (p / (1 - p));
    if (k >= successes) tail += term;
  }
  return Math.min(1, tail);
}

function lowerBinomial(successes, n) {
  if (!n || !successes) return 0;
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 80; step++) {
    const mid = (lo + hi) / 2;
    if (binomialTail(n, successes, mid) < ALPHA) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function binomialBounds(successes, n) {
  return { n, successes, rate: n ? successes / n : null,
    lower: lowerBinomial(successes, n), upper: 1 - lowerBinomial(n - successes, n) };
}

function metrics(rows) {
  const known = rows.filter(row => row.oracle.answerable);
  const unknown = rows.filter(row => !row.oracle.answerable);
  const resolved = known.filter(row => row.valid);
  const answered = known.filter(row => row.valid && !row.decision.abstain);
  const successes = answered.filter(row => row.oracle.numericCorrect);
  return { assigned: rows.length, valid: rows.filter(row => row.valid).length,
    knownSuccess: known.length ? successes.length / known.length : null,
    knownCoverage: known.length ? answered.length / known.length : null,
    selectiveAccuracy: answered.length ? successes.length / answered.length : null,
    calibrationCoverage: known.length ? resolved.length / known.length : 0,
    brier: mean(resolved.map(row => (row.response.confidence - Number(row.oracle.numericCorrect)) ** 2)),
    unknownRecognition: binomialBounds(unknown.filter(row => row.valid && row.oracle.recognized).length, unknown.length),
    unknownHighConfidenceError: binomialBounds(unknown.filter(row => highConfidenceError(row)).length, unknown.length) };
}

function highConfidenceError(row) {
  if (!row.valid) return true;
  return row.response.confidence >= protocol.highConfidence;
}

const success = row => Number(row.valid && !row.decision.abstain && row.oracle.numericCorrect);

function comparisons(rows) {
  const result = [];
  for (const family of ['new_input', 'new_composition']) {
    const experienced = rows.filter(row => row.arm === 'experienced' && row.family === family);
    for (const control of ['initial', 'reset']) {
      const controls = new Map(rows.filter(row => row.arm === control).map(row => [row.taskId, row]));
      const complete = experienced.every(row => controls.has(row.taskId));
      const bound = complete ? pairedBound(experienced.map(row => success(row) - success(controls.get(row.taskId))))
        : pairedBound([]);
      result.push({ family, control, ...bound });
    }
  }
  return result;
}

function conclusion(input) {
  const { byArm, transfer, integrity } = input;
  const exp = byArm.experienced;
  const gates = {
    integrity: Object.values(integrity).every(value => value === true),
    transfer: transfer.every(item => item.lower !== null && item.lower > protocol.minimumPracticalGain),
    usefulCoverage: exp.knownCoverage >= protocol.minimumKnownCoverage,
    ignorance: exp.unknownRecognition.lower >= protocol.minimumUnknownRecognition,
    unsafeConfidence: exp.unknownHighConfidenceError.upper <= protocol.maximumUnknownHighConfidenceError,
    calibration: calibrationGate(byArm)
  };
  return { gates, status: Object.values(gates).every(Boolean) ? 'bounded_support' : 'not_demonstrated',
    scope: protocol.scope, generalCompetenceDemonstrated: false, authorizesPromotion: false };
}

function calibrationGate(byArm) {
  const exp = byArm.experienced;
  const allCovered = Object.values(byArm).every(item => item.calibrationCoverage === 1);
  return allCovered && exp.brier <= protocol.maximumBrier
    && exp.brier <= byArm.initial.brier + protocol.maximumBrierDegradation;
}

module.exports = { mean, pairedBound, binomialBounds, metrics, comparisons, conclusion };
