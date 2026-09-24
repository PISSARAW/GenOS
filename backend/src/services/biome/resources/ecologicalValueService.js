'use strict';

function scorePopulation({ population, niche, overrides = {} }) {
  const configured = { ...population.allocationSignals, ...overrides };
  const signals = resolveSignals({ configured, population, niche });
  validateSignals(signals);
  return { value: calculateValue(signals), signals };
}

function resolveSignals({ configured, population, niche }) {
  return {
    marginalReturn: signal(configured, 'marginalReturn', signal(population, 'marginalProductivity', signal(population, 'productivity', 0))),
    informationGain: signal(configured, 'informationGain', signal(niche, 'informationGain', 0)),
    criticality: signal(configured, 'criticality', 1),
    learningProgress: signal(configured, 'learningProgress', 1),
    keystoneValue: signal(configured, 'keystoneValue', 1),
    cost: signal(configured, 'cost', 1),
    pressure: signal(configured, 'pressure', measuredPressure(niche)),
    redundancy: signal(configured, 'redundancy', 1),
    risk: signal(configured, 'risk', 1)
  };
}

function signal(source, key, fallback) {
  return source[key] === undefined ? fallback : source[key];
}

function calculateValue(signals) {
  const numerator = signals.marginalReturn * signals.informationGain * signals.criticality
    * signals.learningProgress * signals.keystoneValue;
  const denominator = signals.cost * signals.pressure * signals.redundancy * signals.risk;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function measuredPressure(niche) {
  if (!niche.capacityKnown || niche.carryingCapacity <= 0) return 1;
  return niche.occupancy ? niche.occupancy / niche.carryingCapacity : 1;
}

function validateSignals(signals) {
  const values = Object.values(signals);
  if (values.some((value) => !Number.isFinite(value) || value < 0)
    || [signals.cost, signals.pressure, signals.redundancy, signals.risk].some((value) => value === 0)) {
    throw Object.assign(new Error('Allocation signals must be finite and divisor signals must be positive.'), { code: 'BIOME_ALLOCATION_SIGNAL_INVALID' });
  }
}

module.exports = { scorePopulation };
