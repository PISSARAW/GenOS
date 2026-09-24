'use strict';

function selectAblation(input = {}) {
  const rate = Number.isFinite(input.sampleRate) ? Math.max(0, Math.min(1, input.sampleRate)) : 0;
  const sample = Number.isFinite(input.sampleValue) ? input.sampleValue : 1;
  if (sample >= rate) return { selected: false, ablations: [] };
  const ids = Array.isArray(input.componentIds) ? input.componentIds : [];
  return { selected: true, ablations: ids.map((componentId) => ({ componentId, remove: true })) };
}

function marginalContribution(fullUtility, ablatedUtility) {
  return Number.isFinite(fullUtility) && Number.isFinite(ablatedUtility) ? fullUtility - ablatedUtility : null;
}

module.exports = { marginalContribution, selectAblation };
