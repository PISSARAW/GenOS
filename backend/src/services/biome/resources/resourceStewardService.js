'use strict';

const { RESOURCE_KEYS } = require('../constants');
const { createResourceVector } = require('../contracts/resourceVector');
const allocator = require('./ecologicalBudgetAllocator');
const capacityService = require('./carryingCapacityService');
const pressureService = require('./resourcePressureService');
const reserveService = require('./recoveryReserveService');

function allocate(ecology, command = {}) {
  const incoming = createResourceVector(command.resources);
  const available = addVectors(ecology.resourcePool, incoming);
  const reserved = reserveService.reserveResources(available, command.reserveRatio ?? 0.1);
  const result = allocator.allocateBudget({ available: reserved.spendable, populations: ecology.populations, niches: ecology.niches });
  ecology.populations = ecology.populations.map((population) => withAllocation(population, result.allocations[population.populationId]));
  ecology.resourcePool = remainingResources(reserved.spendable, result.allocations);
  ecology.ecologicalState.recoveryReserve = addVectors(ecology.ecologicalState.recoveryReserve, reserved.reserve);
  const measurements = ecology.populations.map((population) => assessPopulation(population, ecology.niches));
  ecology.ecologicalState.resourcePressure = measurements.map((item) => item.pressure);
  ecology.ecologicalState.carryingCapacity = measurements.map((item) => item.capacity);
  return { ...result, reserve: ecology.ecologicalState.recoveryReserve, remaining: ecology.resourcePool,
    pressure: ecology.ecologicalState.resourcePressure, carryingCapacity: ecology.ecologicalState.carryingCapacity };
}

function consume(population, niche, requested) {
  const resources = createResourceVector(requested);
  const insufficient = RESOURCE_KEYS.filter((key) => resources[key] > population.resourcePool[key]);
  if (insufficient.length) throw Object.assign(new Error(`Insufficient resources: ${insufficient.join(', ')}.`), { code: 'BIOME_RESOURCE_INSUFFICIENT', resources: insufficient });
  const remaining = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, population.resourcePool[key] - resources[key]]));
  const updated = { ...population, resourcePool: createResourceVector(remaining) };
  return { population: updated, consumed: resources, pressure: pressureService.assessPressure(updated, niche) };
}

function releaseReserve(ecology) {
  return reserveService.releaseReserve(ecology);
}

function assessPopulation(population, niches) {
  const niche = niches.find((item) => item.nicheId === population.nicheId);
  return { pressure: pressureService.assessPressure(population, niche), capacity: capacityService.estimateCapacity(population, niche) };
}

function withAllocation(population, allocation = {}) {
  return { ...population, resourcePool: createResourceVector(addVectors(population.resourcePool, allocation)) };
}

function remainingResources(spendable, allocations) {
  const assigned = Object.values(allocations).reduce((sum, vector) => addVectors(sum, vector), createResourceVector());
  return createResourceVector(Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.max(0, spendable[key] - assigned[key])] )));
}

function addVectors(left = {}, right = {}) {
  return createResourceVector(Object.fromEntries(RESOURCE_KEYS.map((key) => [key, (left[key] || 0) + (right[key] || 0)])));
}

module.exports = { allocate, consume, releaseReserve };
