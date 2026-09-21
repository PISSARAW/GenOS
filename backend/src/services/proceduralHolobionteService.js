"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function holobionte(input = {}) {
  return {
    id: input.id || `holo-${Date.now()}`,
    host: input.host || { id: "host", procedure: null },
    symbionts: input.symbionts || [],
    fitness: input.fitness || 0,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

function addSymbionte(holobionte, symbionte) {
  return { ...holobionte, symbionts: [...holobionte.symbionts, symbionte] };
}

function removeSymbionte(holobionte, symbionteId) {
  return { ...holobionte, symbionts: holobionte.symbionts.filter((s) => s.id !== symbionteId) };
}

function compositeFitness(holobionte, weights = {}) {
  const hostW = weights.host || 0.5;
  const symW = weights.symbiont || 0.5;
  const hostFit = clamp01(holobionte.host?.fitness || 0);
  const symFits = holobionte.symbionts.map((s) => clamp01(s.fitness || 0));
  const symAvg = symFits.length ? symFits.reduce((a, b) => a + b, 0) / symFits.length : 0;
  return clamp01(hostW * hostFit + symW * symAvg);
}

function hasSymbionte(holobionte, symbionteId) {
  return holobionte.symbionts.some((s) => s.id === symbionteId);
}

module.exports = {
  holobionte,
  addSymbionte,
  removeSymbionte,
  compositeFitness,
  hasSymbionte,
};
