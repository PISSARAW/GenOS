'use strict';

const DEFAULT_EPSILON = 0.1;

function calibrationOf(contract) {
  if (typeof contract === 'number') return Number.isFinite(contract) ? contract : null;
  const value = contract && contract.evidenceModel && contract.evidenceModel.calibration;
  return Number.isFinite(value) ? Number(value) : null;
}

function check(parentContract, childContract, epsilon = DEFAULT_EPSILON) {
  const a = calibrationOf(parentContract);
  const b = calibrationOf(childContract);
  if (a === null || b === null) {
    return { valid: false, reason: 'evidence model calibration is missing on one side' };
  }
  const limit = epsilon === undefined || epsilon === null ? DEFAULT_EPSILON : Number(epsilon);
  if (!Number.isFinite(limit) || limit < 0) {
    return { valid: false, reason: 'evidence epsilon must be a non-negative number' };
  }
  const drift = Math.abs(a - b);
  if (drift - limit > 1e-9) {
    return { valid: false, reason: `evidence calibration drift ${drift.toFixed(2)} exceeds epsilon ${limit}` };
  }
  return { valid: true, drift };
}

module.exports = { DEFAULT_EPSILON, check };
