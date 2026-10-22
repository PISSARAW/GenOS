'use strict';

const DEFAULT_EPSILON = 0.1;

function calibrationOf(contract) {
  const value = contract && contract.evidenceModel && contract.evidenceModel.calibration;
  return Number.isFinite(value) ? Number(value) : null;
}

function check(parentContract, childContract, epsilon = DEFAULT_EPSILON) {
  const a = calibrationOf(parentContract);
  const b = calibrationOf(childContract);
  if (a === null || b === null) {
    return { valid: false, reason: 'evidence model calibration is missing on one side' };
  }
  const drift = Math.abs(a - b);
  if (drift > Number(epsilon)) {
    return { valid: false, reason: `evidence calibration drift ${drift.toFixed(2)} exceeds epsilon ${epsilon}` };
  }
  return { valid: true };
}

module.exports = { check };
