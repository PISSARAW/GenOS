"use strict";

const identity = require('./proceduralIdentityService');

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function metapopulation(input = {}) {
  return {
    id: input.id || identity.createOccurrenceId('meta'),
    populations: input.populations || [],
    recolonizers: input.recolonizers || [],
    collapsed: input.collapsed || [],
  };
}

function addPopulation(meta, pop) {
  return { ...meta, populations: [...meta.populations, pop] };
}

function markCollapsed(meta, popId) {
  return {
    ...meta,
    populations: meta.populations.filter((p) => p.id !== popId),
    collapsed: [...meta.collapsed, popId],
  };
}

function recolonize(meta, newPop) {
  return { ...meta, populations: [...meta.populations, newPop] };
}

function totalDiversity(meta) {
  return new Set(meta.populations.map((p) => p.niche?.id)).size;
}

module.exports = {
  metapopulation,
  addPopulation,
  markCollapsed,
  recolonize,
  totalDiversity,
};
