'use strict';

const { NICHE_STATUSES } = require('../constants');
const { requiredId, enumValue, nonNegative } = require('./contractHelpers');

function createNiche(input = {}) {
  return {
    nicheId: requiredId(input.nicheId, 'nicheId'),
    descriptor: String(input.descriptor || '').trim(),
    requiredCapabilities: stringList(input.requiredCapabilities),
    opportunityScore: nonNegative(input.opportunityScore, 'opportunityScore'),
    entryConditions: input.entryConditions || [],
    survivalConditions: input.survivalConditions || [],
    exitConditions: input.exitConditions || [],
    resourceProfile: input.resourceProfile || {},
    carryingCapacity: nonNegative(input.carryingCapacity, 'carryingCapacity'),
    productivity: nonNegative(input.productivity, 'productivity'),
    uncertainty: nonNegative(input.uncertainty, 'uncertainty'),
    novelty: nonNegative(input.novelty, 'novelty'),
    informationGain: nonNegative(input.informationGain, 'informationGain'),
    occupancy: nonNegative(input.occupancy, 'occupancy'),
    status: enumValue({ value: input.status, choices: NICHE_STATUSES, field: 'status', fallback: 'candidate' })
  };
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

module.exports = { createNiche };
