'use strict';

const { ecosystemHealth } = require('../variants/variantSessionOperations');
const { RESOURCE_KEYS } = require('../constants');

function measure(ecology) {
  const populations = ecology.populations;
  const live = populations.filter(p => !['extinct', 'dormant'].includes(p.status));
  const individuals = live.flatMap(p => p.individuals);
  const capabilities = [...new Set(individuals.flatMap(i => i.capabilities))];
  const required = [...new Set(ecology.niches.flatMap(n => n.requiredCapabilities))];
  const coverage = required.length ? required.filter(c => capabilities.includes(c)).length / required.length : null;
  const productive = live.filter(p => p.productivity > 0);
  const pressures = ecology.niches.filter(n => n.capacityKnown)
    .map(n => n.carryingCapacity > 0 ? n.occupancy / n.carryingCapacity : Number(n.occupancy > 0));
  const productivity = productive.reduce((sum, p) => sum + p.productivity, 0);
  const runtime = ecology.ecologicalState.runtime;
  const resources = resourceMetrics(ecology, runtime);
  const diversity = ecosystemHealth(individuals.map(i => i.phenotype?.strategy || i.role));
  const health = classify({ coverage, productivity, pressure: Math.max(0, ...pressures), resources });
  return { tick: runtime.tick, populations: { count: populations.length, active: live.length,
    extinct: populations.filter(p => p.status === 'extinct').length, totalIndividuals: individuals.length,
    totalProductivity: productivity }, niches: { count: ecology.niches.length,
    colonized: ecology.niches.filter(n => n.occupancy > 0).length }, resources,
    diversity: { behavioral: diversity.behavioralDiversity, functionalCoverage: coverage },
    health, recovery: recoveryMetrics(ecology), tippingPoints: tippingPoints(runtime, productivity, pressures) };
}

function resourceMetrics(ecology, runtime) {
  const budgetTotal = runtime.budgetTotal ?? 0;
  const budgetUsed = runtime.budgetUsed || 0;
  const balances = Object.fromEntries(RESOURCE_KEYS.map(key => [key,
    (ecology.resourcePool[key] || 0) + ecology.populations.reduce((sum, p) => sum + p.resourcePool[key], 0)]));
  return { pool: { ...ecology.resourcePool }, balances, budgetTotal, budgetUsed,
    budgetPressure: budgetTotal > 0 ? budgetUsed / budgetTotal : 0,
    recoveryReserve: ecology.ecologicalState.recoveryReserve || {},
    verificationReserve: ecology.ecologicalState.verificationReserve || {},
    explorationReserve: ecology.ecologicalState.explorationReserve || {},
    quarantined: ecology.ecologicalState.resourceQuarantine || {} };
}

function classify({ coverage, productivity, pressure, resources }) {
  if (pressure > 1 || resources.budgetPressure > 1) return 'stressed';
  if (productivity <= 0 || coverage === null) return 'unknown';
  return coverage < 1 ? 'incomplete' : 'productive';
}

function recoveryMetrics(ecology) {
  const experiment = ecology.ecologicalState.disturbance;
  if (!experiment) return { status: 'unmeasured', resilience: null };
  const productivity = ecology.populations.filter(p => !['extinct', 'dormant'].includes(p.status))
    .reduce((sum, p) => sum + p.productivity, 0);
  const resistance = experiment.baseline > 0 ? productivity / experiment.baseline : null;
  const fresh = ecology.ecologicalState.lastMeasuredTick > experiment.tick;
  const recovered = fresh && resistance !== null && resistance >= 0.9;
  return { status: recovered ? 'recovered' : 'disturbed', resistance,
    recoveryTicks: recovered ? ecology.ecologicalState.runtime.tick - experiment.tick : null,
    evidenceRefs: experiment.evidenceRefs };
}

function tippingPoints(runtime, productivity, pressures) {
  const points = [];
  const prior = runtime.history?.at(-1)?.measurements;
  if (pressures.some(p => p > 1)) points.push('capacity_exceeded');
  if (prior?.populations.totalProductivity > 0 && productivity < prior.populations.totalProductivity * 0.5) points.push('productivity_collapse');
  return points;
}

module.exports = { measure };
