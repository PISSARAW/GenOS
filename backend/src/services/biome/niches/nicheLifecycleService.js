'use strict';

const { qualifiesForOpening } = require('./nicheOpportunityService');

function advanceNiche(niche, measurements = {}, options = {}) {
  const nextStatus = selectStatus(niche, measurements, options);
  return { ...niche, ...measurements, status: nextStatus };
}

function selectStatus(niche, measurements, options) {
  const occupancy = numeric(measurements.occupancy, niche.occupancy);
  const capacity = numeric(measurements.carryingCapacity, niche.carryingCapacity);
  const productivity = numeric(measurements.productivity, niche.productivity);
  if (niche.status === 'candidate') return qualifiesForOpening(niche, options) ? 'open' : 'candidate';
  if (niche.status === 'dormant') return measurements.reactivated === true ? 'open' : 'dormant';
  if (niche.status === 'closed') return 'closed';
  return activeStatus(niche.status, { occupancy, capacity, productivity }, options);
}

function activeStatus(status, measure, options) {
  if (shouldDecline(measure.productivity, options.declineProductivityThreshold)) return 'declining';
  if (measure.capacity > 0 && measure.occupancy >= measure.capacity) return 'saturated';
  if (measure.occupancy > 0 && ['open', 'saturated', 'declining'].includes(status)) return 'colonized';
  if (status === 'declining' && measure.occupancy === 0) return 'dormant';
  return status;
}

function shouldDecline(productivity, threshold) {
  return Number.isFinite(threshold) && productivity <= threshold;
}

function numeric(value, fallback) {
  return Number.isFinite(value) ? value : (Number.isFinite(fallback) ? fallback : 0);
}

module.exports = { advanceNiche };
