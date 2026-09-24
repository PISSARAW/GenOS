'use strict';

function evaluateCorridor(sourcePatch, targetPatch, profile = {}) {
  const compatibility = unit(profile.compatibility ?? 0.5);
  const homogenizationRisk = unit(profile.homogenizationRisk ?? 0);
  const patchQuality = Math.min(unit(sourcePatch?.quality ?? 0), unit(targetPatch?.quality ?? 0));
  const accessibility = Math.min(unit(sourcePatch?.accessibility ?? 0), unit(targetPatch?.accessibility ?? 0));
  const quality = compatibility * patchQuality * accessibility * (1 - homogenizationRisk);
  const patchCapacity = Math.min(Number(sourcePatch?.carryingCapacity || 0), Number(targetPatch?.carryingCapacity || 0));
  return {
    compatibility, homogenizationRisk, migrationCost: Number(profile.migrationCost || 0),
    capacity: Math.max(0, Math.floor(patchCapacity * quality)), weight: Number(quality.toFixed(3))
  };
}

function unit(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

module.exports = { evaluateCorridor };
