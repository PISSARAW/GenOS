'use strict';

const { SCOPES, SESSION_STATUSES } = require('../constants');
const { record, string, enumValue, array, boundedNumber, integer } = require('./contractHelpers');

function validateMetapopulationSession(input) {
  const session = record(input, 'METAPOPULATION_SESSION_INVALID');
  const code = 'METAPOPULATION_SESSION_INVALID';
  for (const field of ['metapopulationId', 'missionId', 'mission', 'organization', 'createdAt', 'updatedAt']) string(session[field], field, code);
  enumValue(session.scope, 'scope', { allowed: SCOPES, code });
  enumValue(session.status, 'status', { allowed: SESSION_STATUSES, code });
  array(session.patches, 'patches', code);
  array(session.demes, 'demes', code);
  record(session.migrationGraph, 'METAPOPULATION_SESSION_INVALID');
  record(session.regionalMemory, 'METAPOPULATION_SESSION_INVALID');
  integer(session.generation, 'generation', code);
  integer(session.revision, 'revision', code);
  return session;
}

module.exports = { validateMetapopulationSession };
