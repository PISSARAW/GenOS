"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function apoptosisCondition(input = {}) {
  return {
    fitness: input.fitness ?? 0,
    risk: input.risk ?? 0,
    recoveryAttempts: input.recoveryAttempts ?? 0,
  };
}

function shouldApoptose(input = {}, thresholds = {}) {
  const t = {
    fitness: thresholds.fitness ?? 0.1,
    risk: thresholds.risk ?? 0.9,
    recoveryAttempts: thresholds.recoveryAttempts ?? 3,
  };
  return input.fitness < t.fitness && input.risk > t.risk && input.recoveryAttempts >= t.recoveryAttempts;
}

function apoptose(input = {}) {
  return {
    ...input,
    apoptotic: true,
    apoptoticAt: new Date().toISOString(),
  };
}

function isApoptotic(input = {}) {
  return input.apoptotic === true;
}

module.exports = {
  apoptosisCondition,
  shouldApoptose,
  apoptose,
  isApoptotic,
};
