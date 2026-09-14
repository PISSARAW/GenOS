'use strict';

/**
 * @file biomeCoordinationService.js
 * @description Biome coordination: an operating environment of specialized
 * populations. Wires ecological resource allocation, optimal foraging and the
 * swarm diversity metric instead of leaving them as prompt-only mechanisms.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const swarmMetricsService = require('./swarmMetricsService');
const { defaultForaging } = require('./foragingScoutHarvesterService');

const DEFAULT_ORGANIZATION = 'energy_huddle';
const MECHANISMS = ['resource_allocation', 'optimal_foraging', 'quorum_sensing'];

function composeBiome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Biome mission is required.'), { code: 'BIOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  return {
    mode: 'biome',
    mission: goal,
    organization,
    mechanisms: MECHANISMS,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biome', organization }),
    members: biologicalModeService.compose('biome', goal)
  };
}

function allocateResources(populations, options = {}) {
  const list = Array.isArray(populations) ? populations : [];
  const totalBudget = Number.isFinite(options.totalBudget) ? Math.max(0, options.totalBudget) : list.length * 1000;
  const floor = Number.isFinite(options.minimumPerPopulation) ? Math.max(0, options.minimumPerPopulation) : 0;
  const weights = list.map((population) => Math.max(0, (Number(population?.demand) || 1) * (Number(population?.priority) || 1)));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const distributable = Math.max(0, totalBudget - floor * list.length);
  const allocations = list.map((population, index) => ({
    id: population?.id || `population_${index + 1}`,
    budget: Math.round(floor + (weights[index] / weightSum) * distributable)
  }));
  return { totalBudget, floor, allocations, conserved: allocations.reduce((sum, entry) => sum + entry.budget, 0) <= totalBudget };
}

function forageStep(patchHistory, options = {}) {
  const iteration = Number.isFinite(options.iteration) ? options.iteration : 1;
  const elapsedTimeSec = Number.isFinite(options.elapsedTimeSec) ? options.elapsedTimeSec : 1;
  return {
    patchYield: defaultForaging.evaluatePatchYield(Array.isArray(patchHistory) ? patchHistory : [], elapsedTimeSec),
    levyStep: defaultForaging.computeLevyFlightStep(iteration)
  };
}

function ecosystemHealth(observations) {
  const labels = (Array.isArray(observations) ? observations : []).map((observation) => (typeof observation === 'string' ? observation : observation?.label)).filter(Boolean);
  if (!labels.length) return { entropy: null, verdict: 'unknown' };
  const entropy = swarmMetricsService.calculateShannonEntropy(labels);
  return { entropy, verdict: entropy.normalizedEntropy >= 0.5 ? 'resilient' : 'fragile' };
}

module.exports = { composeBiome, allocateResources, forageStep, ecosystemHealth };
