'use strict';

const { NICHE_STATUSES } = require('../constants');
const { RESOURCE_KEYS } = require('../constants');
const { requiredId, enumValue, nonNegative, invalid } = require('./contractHelpers');

function createNiche(input = {}) {
  return {
    nicheId: requiredId(input.nicheId, 'nicheId'),
    opportunityId: input.opportunityId || null,
    descriptor: String(input.descriptor || '').trim(),
    requiredCapabilities: stringList(input.requiredCapabilities),
    opportunityScore: nonNegative(input.opportunityScore, 'opportunityScore'),
    evidenceRefs: stringList(input.evidenceRefs),
    sourceSignals: stringList(input.sourceSignals),
    justifiedUncertainty: nonNegative(input.justifiedUncertainty, 'justifiedUncertainty'),
    entryConditions: input.entryConditions || [],
    survivalConditions: input.survivalConditions || [],
    exitConditions: input.exitConditions || [],
    resourceProfile: normalizeResourceProfile(input.resourceProfile),
    carryingCapacity: nonNegative(input.carryingCapacity, 'carryingCapacity'),
    declaredCarryingCapacity: nonNegative(input.declaredCarryingCapacity ?? input.carryingCapacity, 'declaredCarryingCapacity'),
    declaredCapacityKnown: input.declaredCapacityKnown === true || input.capacityKnown === true || Number(input.carryingCapacity) > 0,
    capacityKnown: input.capacityKnown === true || Number(input.carryingCapacity) > 0,
    productivity: nonNegative(input.productivity, 'productivity'),
    uncertainty: nonNegative(input.uncertainty, 'uncertainty'),
    novelty: nonNegative(input.novelty, 'novelty'),
    informationGain: nonNegative(input.informationGain, 'informationGain'),
    occupancy: nonNegative(input.occupancy, 'occupancy'),
    status: enumValue({ value: input.status, choices: NICHE_STATUSES, field: 'status', fallback: 'candidate' })
  };
}

function normalizeResourceProfile(profile = {}) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, normalizeRequirement(profile[key], key)]));
}

function normalizeRequirement(value, key) {
  const entry = typeof value === 'number' ? { preferred: value, maximum: value } : (value || {});
  const requirement = {
    minimum: nonNegative(entry.minimum, `${key}.minimum`),
    preferred: nonNegative(entry.preferred, `${key}.preferred`),
    maximum: nonNegative(entry.maximum, `${key}.maximum`, Number.MAX_SAFE_INTEGER)
  };
  if (requirement.minimum > requirement.preferred || requirement.preferred > requirement.maximum) {
    throw invalid(`Resource profile '${key}' must satisfy minimum <= preferred <= maximum.`);
  }
  return requirement;
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

module.exports = { createNiche };
