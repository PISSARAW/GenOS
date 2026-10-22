'use strict';

const { RESOURCE_KEYS } = require('../constants');

function optimize(populations, options = {}) {
  const learningRate = finite(options.learningRate, 0.1);
  const populationsList = Array.isArray(populations) ? populations : [];
  const raw = populationsList.map((population) => rawWeight(population, options));
  const total = raw.reduce((sum, value) => sum + value, 0);
  const normalized = total > 0 ? raw.map((value) => value / total) : raw.map(() => 0);
  const weights = Object.fromEntries(populationsList.map((population, index) => [
    population.populationId || population.id || `population-${index}`,
    normalized[index]
  ]));
  const diagnostics = populationsList.map((population, index) => ({
    populationId: population.populationId || population.id || `population-${index}`,
    rawWeight: raw[index],
    normalizedWeight: normalized[index],
    productivity: finite(population.productivity, 0),
    marginalProductivity: finite(population.marginalProductivity, 0),
    starving: isStarving(population)
  }));
  return { learningRate, weights, diagnostics, totalRawWeight: total };
}

function rawWeight(population, options) {
  const productivity = finite(population.productivity, 0);
  const marginal = finite(population.marginalProductivity, productivity);
  const base = Math.max(0, marginal || productivity || 0);
  const starvationBoost = isStarving(population) ? finite(options.starvationBoost, 1.5) : 1;
  const explorationBoost = finite(population.explorationValue, 1);
  return base * starvationBoost * explorationBoost;
}

function isStarving(population) {
  const pool = population.resourcePool || {};
  return RESOURCE_KEYS.some((key) => finite(pool[key], 0) <= 0
    && finite(population.minimumResource?.[key], 0) > 0);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

module.exports = { optimize };
