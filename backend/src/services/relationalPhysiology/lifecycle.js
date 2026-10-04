'use strict';

const { LINEAGE } = require('./catalog');
const { natural, invalid } = require('./validate');

const TRANSITIONS = Object.freeze({
  proposed: Object.freeze({ admit: 'active', revoke: 'revoked' }),
  active: Object.freeze({ suspend: 'suspended', revoke: 'revoked', expire: 'expired' }),
  suspended: Object.freeze({ resume: 'active', revoke: 'revoked', expire: 'expired' }),
  revoked: Object.freeze({}), expired: Object.freeze({})
});

// Pure transition proposal. Persistence requires the existing authority plane and
// an atomic compare-and-swap on expectedVersion; this function does not write.
function transition(edge, command) {
  natural(edge.version, 'edge.version');
  natural(edge.updatedAt, 'edge.updatedAt');
  natural(edge.validFrom, 'edge.validFrom');
  if (command.at < edge.validFrom) invalid('lifecycle.before.validity');
  natural(command.expectedVersion, 'expectedVersion');
  natural(command.at, 'at');
  if (edge.version !== command.expectedVersion) invalid('version.conflict');
  if (command.authorized !== true) invalid('lifecycle.authority');
  if (command.at < edge.updatedAt) invalid('lifecycle.time');
  const next = TRANSITIONS[edge.state]?.[command.event];
  if (!next) invalid('lifecycle.transition');
  checkExpiry(edge, command, next);
  return {
    ...edge, state: next, version: edge.version + 1, updatedAt: command.at,
    retainHistoricalDependence: LINEAGE.includes(edge.type)
  };
}

function checkExpiry(edge, command, next) {
  if (command.event === 'expire' && (edge.validUntil === null || command.at < edge.validUntil)) invalid('premature.expiry');
  if (next === 'active' && edge.validUntil !== null && command.at >= edge.validUntil) invalid('expired.activation');
}

module.exports = { transition, TRANSITIONS };
