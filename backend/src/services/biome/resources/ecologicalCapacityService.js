'use strict';

const capacityService = require('./carryingCapacityService');
const pressureService = require('./nichePressureService');
const nicheStore = require('../niches/nicheStore');
const nicheLifecycle = require('../niches/nicheLifecycleService');

function assessAndApply(ecology, command = {}) {
  const measurements = command.measurements || {};
  const local = ecology.niches.map((niche) => capacityService.assessNicheCapacity({
    niche, populations: ecology.populations, measurements: measurements[niche.nicheId] || {}
  }));
  const garage = capacityService.resolveGarageCapacity(command.garageCapacity);
  const bounded = capacityService.applyGarageLimit(local, ecology.niches, garage);
  const assessments = bounded.map((entry) => updateNiche(ecology, entry, command.thresholds));
  ecology.ecologicalState.carryingCapacity = assessments;
  ecology.ecologicalState.nichePressure = assessments.map(({ nicheId, occupancy, ...pressure }) => ({ nicheId, occupancy, ...pressure }));
  const requestedActions = assessments.filter((entry) => ['recruit', 'throttle', 'shrink_or_migrate'].includes(entry.action))
    .map((entry) => ({ type: entry.action.toUpperCase(), status: 'requested', nicheId: entry.nicheId, pressure: entry.pressure }));
  return { assessments, requestedActions, action: { type: 'CARRYING_CAPACITY_ASSESSED', status: 'applied', nicheCount: assessments.length } };
}

function updateNiche(ecology, entry, thresholds) {
  const niche = ecology.niches.find((item) => item.nicheId === entry.nicheId);
  const occupancy = niche.occupancy;
  const pressure = pressureService.assessOccupancy(occupancy, entry.capacity, thresholds);
  const updated = nicheLifecycle.advanceNiche(niche, {
    carryingCapacity: entry.capacity, capacityKnown: true, occupancy
  });
  ecology.niches = nicheStore.upsertNiche(ecology.niches, updated);
  return { ...entry, occupancy, ...pressure, status: updated.status };
}

module.exports = { assessAndApply };
