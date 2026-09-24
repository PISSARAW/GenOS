'use strict';

const { EVENT_TYPES } = require('../constants');
const { record, string, enumValue, boundedNumber } = require('./contractHelpers');

function validateRegionalEvent(input) {
  const event = record(input, 'METAPOPULATION_EVENT_INVALID');
  const code = 'METAPOPULATION_EVENT_INVALID';
  string(event.type, 'type', code);
  enumValue(event.type, 'type', { allowed: EVENT_TYPES, code });
  string(event.actor, 'actor', code);
  string(event.occurredAt, 'occurredAt', code);
  record(event.payload || {}, code);
  record(event.provenance || {}, code);
  if (event.sequence !== undefined) boundedNumber(event.sequence, 'sequence', { minimum: 1, maximum: Number.MAX_SAFE_INTEGER, code });
  if (event.revision !== undefined) boundedNumber(event.revision, 'revision', { minimum: 1, maximum: Number.MAX_SAFE_INTEGER, code });
  return event;
}

module.exports = { validateRegionalEvent };
