'use strict';

function advancePopulation(population, measurements = {}) {
  const members = Array.isArray(measurements.individuals) ? measurements.individuals : population.individuals;
  const count = members.length;
  const capacity = numeric(measurements.carryingCapacity, 0);
  const births = numeric(measurements.birthRate, population.birthRate);
  const deaths = numeric(measurements.deathRate, population.deathRate);
  const productivity = numeric(measurements.productivity, population.productivity);
  const next = chooseStatus(population.status, {
    count, capacity, births, deaths, productivity,
    recolonized: measurements.recolonized,
    extinctionConfirmed: measurements.extinctionConfirmed
  });
  return { ...population, individuals: members, birthRate: births, deathRate: deaths, productivity, status: next };
}

const transitions = {
  extinct: (data) => data.recolonized && data.count > 0 ? 'recolonized' : 'extinct',
  recolonized: (data) => data.count ? 'growing' : 'seed',
  seed: (data) => data.count ? 'growing' : 'seed',
  dormant: (data) => data.extinctionConfirmed ? 'extinct' : data.count ? 'growing' : 'dormant',
  saturated: (data) => declining(data) ? 'declining' : capacityStatus(data),
  declining: (data) => data.extinctionConfirmed ? 'extinct' : data.count ? decliningStatus(data) : 'dormant',
  growing: (data) => growingStatus(data),
  established: (data) => declining(data) ? 'declining' : capacityStatus(data)
};

function chooseStatus(status, data) {
  return (transitions[status] || (() => capacityStatus(data)))(data);
}

function declining(data) {
  return data.deaths > data.births || data.productivity <= 0;
}

function recovering(data) {
  return data.births > data.deaths && data.productivity > 0;
}

function decliningStatus(data) {
  return recovering(data) ? 'growing' : 'dormant';
}

function capacityStatus(data) {
  if (data.capacity > 0 && data.count >= data.capacity) return 'saturated';
  return data.count >= 2 && data.productivity > 0 ? 'established' : 'growing';
}

function growingStatus(data) {
  if (data.deaths > data.births || data.productivity <= 0) return 'declining';
  return capacityStatus(data);
}

function numeric(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

module.exports = { advancePopulation };
