'use strict';

const { RESOURCE_KEYS } = require('../constants');

function assessPressure(population, niche) {
  const resources = {};
  for (const key of RESOURCE_KEYS) {
    const requirement = niche.resourceProfile[key];
    const current = population.resourcePool[key];
    resources[key] = { current, minimum: requirement.minimum, preferred: requirement.preferred,
      maximum: requirement.maximum, pressure: pressureLevel(current, requirement) };
  }
  const levels = Object.values(resources).map((entry) => entry.pressure);
  const level = levels.includes('critical') ? 'critical' : levels.includes('constrained') ? 'constrained' : 'adequate';
  return { populationId: population.populationId, nicheId: niche.nicheId, level, resources };
}

function pressureLevel(current, requirement) {
  if (current < requirement.minimum) return 'critical';
  if (current < requirement.preferred) return 'constrained';
  return 'adequate';
}

module.exports = { assessPressure };
