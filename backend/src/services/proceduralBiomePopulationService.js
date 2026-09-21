"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function population(input = {}) {
  return {
    id: input.id || `pop-${Date.now()}`,
    niche: input.niche || { id: "default" },
    size: Number(input.size) || 0,
    procedures: input.procedures || [],
    fitnessHistory: input.fitnessHistory || [],
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

function populationCapacity(population, options = {}) {
  const maxPop = Number(options.maxPop) || 50;
  return maxPop - population.size;
}

function canReplicate(population, options = {}) {
  return population.size < (Number(options.maxPop) || 50);
}

function registerFitness(population, fitnessScore) {
  return {
    ...population,
    fitnessHistory: [...population.fitnessHistory, fitnessScore],
    size: population.size,
  };
}

function nicheStats(populations) {
  const byNiche = {};
  for (const pop of populations) {
    const key = pop.niche?.id || "default";
    byNiche[key] = (byNiche[key] || 0) + pop.size;
  }
  return byNiche;
}

module.exports = {
  population,
  populationCapacity,
  canReplicate,
  registerFitness,
  nicheStats,
};
