'use strict';

const { digest } = require('../biologicalIntegrity');
const selectorCalibration = require('./morphogenesisSelectorCalibration');

const POLICY_SCHEMA = 'genos.morphogenesis-hysteresis-calibration/v1';

function calibratedEstimates(compiled) {
  return Object.values(compiled?.scales || {}).flatMap((scale) =>
    Object.values(scale.candidates || {}).filter((item) => item.status === 'calibrated'));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bounded(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function fromCompiled(compiled) {
  const estimates = calibratedEstimates(compiled);
  if (!estimates.length) return null;
  const upperCosts = estimates.map((item) => bounded(
    Number(item.validationCost) + Number(item.costUncertainty), 0, 1));
  const measuredUpperCost = mean(upperCosts);
  const evidence = { verifiedSampleCount: compiled.verifiedSampleCount,
    estimates: estimates.map((item) => ({ validationGain: item.validationGain,
      validationCost: item.validationCost, costUncertainty: item.costUncertainty })) };
  return {
    schema: POLICY_SCHEMA,
    minimumGain: Number(bounded(measuredUpperCost, 0.05, 0.5).toFixed(6)),
    cooldownMs: Math.round(5000 + 295000 * measuredUpperCost),
    transitionBudget: Number(bounded(1 - measuredUpperCost, 0.1, 1).toFixed(6)),
    sampleCount: Number(compiled.verifiedSampleCount) || 0,
    evidenceDigest: `sha256:${digest(evidence)}`
  };
}

function calibrate(outcomes) {
  return fromCompiled(selectorCalibration.compileCalibration(outcomes));
}

module.exports = { POLICY_SCHEMA, calibrate, fromCompiled };
