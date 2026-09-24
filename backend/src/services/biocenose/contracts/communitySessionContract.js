'use strict';

const { SESSION_PHASES, SESSION_STATUSES } = require('../constants');

function validateSession(session) {
  if (!session || typeof session !== 'object') return invalid('Session must be an object.');
  if (!nonEmpty(session.communityId) || !nonEmpty(session.question)) return invalid('communityId and question are required.');
  if (!SESSION_PHASES.includes(session.phase)) return invalid('Session phase is invalid.');
  if (!SESSION_STATUSES.includes(session.status)) return invalid('Session status is invalid.');
  if (!Number.isInteger(session.round) || session.round < 0) return invalid('Session round must be a non-negative integer.');
  if (!Array.isArray(session.members)) return invalid('Session members must be an array.');
  return { valid: true, errors: [] };
}

function invalid(message) {
  return { valid: false, errors: [message] };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = { validateSession };
