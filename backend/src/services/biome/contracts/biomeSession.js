'use strict';

const { SCOPES, SESSION_STATUSES } = require('../constants');
const { requiredId, enumValue } = require('./contractHelpers');

function createBiomeSession(input = {}) {
  const biomeId = requiredId(input.biomeId, 'biomeId');
  return {
    biomeId,
    missionId: optionalId(input.missionId),
    scope: enumValue({ value: input.scope, choices: SCOPES, field: 'scope', fallback: 'mission' }),
    environment: input.environment || null,
    niches: Array.isArray(input.niches) ? input.niches : [],
    populations: Array.isArray(input.populations) ? input.populations : [],
    resourcePool: input.resourcePool || {},
    interactionGraph: Array.isArray(input.interactionGraph) ? input.interactionGraph : [],
    archive: Array.isArray(input.archive) ? input.archive : [],
    ecologicalState: input.ecologicalState || { health: 'unknown' },
    tick: Number.isSafeInteger(input.tick) && input.tick >= 0 ? input.tick : 0,
    status: enumValue({ value: input.status, choices: SESSION_STATUSES, field: 'status', fallback: 'active' })
  };
}

function optionalId(value) {
  return value ? requiredId(value, 'missionId') : null;
}

module.exports = { createBiomeSession };
