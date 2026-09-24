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
    environmentConstraints: list(input.environmentConstraints),
    opportunityMap: list(input.opportunityMap),
    niches: list(input.niches),
    populations: list(input.populations),
    resourcePool: object(input.resourcePool),
    interactionGraph: list(input.interactionGraph),
    archive: list(input.archive),
    ecologicalState: object(input.ecologicalState, { health: 'unknown' }),
    tick: validTick(input.tick),
    status: enumValue({ value: input.status, choices: SESSION_STATUSES, field: 'status', fallback: 'active' })
  };
}

function optionalId(value) {
  return value ? requiredId(value, 'missionId') : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function validTick(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

module.exports = { createBiomeSession };
