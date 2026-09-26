'use strict';

const { defaultForaging } = require('../../foragingScoutHarvesterService');
const swarmMetricsService = require('../../swarmMetricsService');

function sourceOpportunities(session, sources = []) {
  if (!session.variantPolicy?.sourceNiches || !Array.isArray(sources)) return [];
  return sources.filter((source) => source?.id && Array.isArray(source.evidenceRefs) && source.evidenceRefs.length)
    .map((source) => ({
      status: 'candidate', opportunityId: `source-${source.id}`,
      descriptor: `Knowledge source: ${source.title || source.id}`,
      requiredCapabilities: source.requiredCapabilities || [], resourceProfile: source.resourceProfile || {},
      opportunityScore: boundedScore(source.relevance, 0.5), novelty: boundedScore(source.novelty, 0.1),
      evidenceRefs: source.evidenceRefs, justifiedUncertainty: boundedScore(source.uncertainty, 0.25)
    }));
}

function boundedScore(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function advanceSuccessionPhase(ecology, policy, measurements = {}) {
  if (!Array.isArray(policy?.phases)) return null;
  const current = ecology.ecologicalState.successionPhase || policy.phases[0];
  const nextIndex = policy.phases.indexOf(current) + 1;
  if (nextIndex <= 0 || nextIndex >= policy.phases.length) return current;
  const productivity = Number.isFinite(measurements.productivity) ? measurements.productivity
    : mean(ecology.populations.map((population) => population.productivity));
  const stability = Number.isFinite(measurements.stability) ? measurements.stability : 0;
  const ready = successionReady({ ecology, measurements, current, productivity, stability });
  if (ready) ecology.ecologicalState.successionPhase = policy.phases[nextIndex];
  return ecology.ecologicalState.successionPhase || current;
}

function successionReady(options) {
  const { ecology, measurements, current, productivity, stability } = options;
  const evidence = strings(measurements.evidenceRefs).length || ecology.niches.some((niche) => niche.evidenceRefs.length);
  const colonized = ecology.niches.some((niche) => niche.status === 'colonized');
  return Boolean(evidence && colonized && productivity > 0 && (current !== 'specialist' || stability >= 0.5));
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }

function healthAssessment(session, observations) {
  const result = ecosystemHealth(observations);
  const target = session.variantPolicy?.diversityTarget;
  const qualityDiversity = Number.isFinite(target) && Number.isFinite(result.behavioralDiversity)
    ? { target, met: result.behavioralDiversity >= target } : null;
  const ecologicalScales = session.variantPolicy?.levels ? scaleMetrics(session.ecology) : null;
  return { ...result, qualityDiversity, ecologicalScales };
}

function scaleMetrics(ecology) {
  return {
    individual: { count: ecology.populations.reduce((sum, population) => sum + population.individuals.length, 0) },
    population: { count: ecology.populations.length },
    ecosystem: { nicheCount: ecology.niches.length, resourcePool: ecology.resourcePool }
  };
}

function allocationOptions(session, options, populationCount) {
  const requestedBudget = Number.isSafeInteger(options.totalBudget) ? options.totalBudget : populationCount * 1000;
  const reserveRatio = session.variantPolicy?.recoveryReserveRatio || 0;
  const recoveryReserveBudget = Math.floor(requestedBudget * reserveRatio);
  const totalBudget = requestedBudget - recoveryReserveBudget;
  const ratio = session.variantPolicy?.minimumAllocationRatio;
  const minimumPerPopulation = Number.isSafeInteger(options.minimumPerPopulation)
    ? options.minimumPerPopulation
    : Number.isFinite(ratio) ? Math.floor(totalBudget * ratio / Math.max(1, populationCount)) : 0;
  return { ...options, totalBudget, minimumPerPopulation, requestedBudget, recoveryReserveBudget,
    computeAware: session.variantPolicy?.computeAware === true };
}

function allocateResources(populations, options = {}) {
  const list = Array.isArray(populations) ? populations : [];
  const totalBudget = options.totalBudget === undefined ? list.length * 1000 : options.totalBudget;
  const floor = options.minimumPerPopulation === undefined ? 0 : options.minimumPerPopulation;
  validateBudget(totalBudget, floor, list.length);
  return distributeBudget(populationWeights(list, options), totalBudget, floor);
}

function validateBudget(totalBudget, floor, count) {
  if (!Number.isSafeInteger(totalBudget) || totalBudget < 0) throw allocationError('totalBudget must be a non-negative safe integer.');
  if (!Number.isSafeInteger(floor) || floor < 0) throw allocationError('minimumPerPopulation must be a non-negative safe integer.');
  if (floor * count > totalBudget) throw allocationError('Population minimums exceed the available budget.');
  if (totalBudget > 0 && count === 0) throw allocationError('At least one population is required for a non-zero budget.');
}

function populationWeights(list, options = {}) {
  const ids = new Set();
  return list.map((population, index) => {
    const id = String(population?.id || `population_${index + 1}`).trim();
    const demand = population?.demand;
    const priority = population?.priority;
    if (!id || ids.has(id)) throw allocationError(`Population id is empty or duplicated: '${id}'.`);
    if (!Number.isFinite(demand) || demand < 0) throw allocationError(`Population '${id}' has an invalid demand.`);
    if (!Number.isFinite(priority) || priority < 0) throw allocationError(`Population '${id}' has an invalid priority.`);
    ids.add(id);
    const computeFactor = options.computeAware ? computeAvailability(population.computeAvailability) : 1;
    return { id, weight: demand * priority * computeFactor };
  });
}

function computeAvailability(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

function distributeBudget(weights, totalBudget, floor) {
  const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (weights.length && (!Number.isFinite(weightSum) || weightSum <= 0)) throw allocationError('Population demand and priority must produce a positive finite weight.');
  const distributable = totalBudget - floor * weights.length;
  const exact = weights.map((entry) => distributable * entry.weight / weightSum);
  const base = exact.map((share) => Math.floor(share));
  let remaining = distributable - base.reduce((sum, value) => sum + value, 0);
  const order = exact.map((share, index) => ({ index, remainder: share - base[index], id: weights[index].id }))
    .sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (let index = 0; index < remaining; index += 1) base[order[index].index] += 1;
  const allocations = weights.map((entry, index) => ({ id: entry.id, budget: floor + base[index] }));
  return { totalBudget, floor, allocations, conserved: allocations.reduce((sum, entry) => sum + entry.budget, 0) === totalBudget };
}

function forageStep(patchHistory, options = {}) {
  const iteration = Number.isFinite(options.iteration) ? options.iteration : 1;
  const elapsedTimeSec = Number.isFinite(options.elapsedTimeSec) ? options.elapsedTimeSec : 1;
  const patchYield = defaultForaging.evaluatePatchYield(Array.isArray(patchHistory) ? patchHistory : [], elapsedTimeSec);
  return { patchYield, levyStep: defaultForaging.computeLevyFlightStep(iteration) };
}

function ecosystemHealth(observations) {
  const labels = (Array.isArray(observations) ? observations : [])
    .map((observation) => (typeof observation === 'string' ? observation : observation?.label)).filter(Boolean);
  if (!labels.length) return { behavioralDiversity: null, ecosystemHealth: 'unknown', verdict: 'unknown' };
  const entropy = swarmMetricsService.calculateShannonEntropy(labels);
  return { behavioralDiversity: entropy.normalizedEntropy, ecosystemHealth: 'unknown', verdict: 'unknown' };
}

function allocationError(message) {
  return Object.assign(new Error(message), { code: 'BIOME_ALLOCATION_INVALID' });
}

module.exports = {
  sourceOpportunities, advanceSuccessionPhase, healthAssessment, allocationOptions,
  allocateResources, forageStep, ecosystemHealth
};
