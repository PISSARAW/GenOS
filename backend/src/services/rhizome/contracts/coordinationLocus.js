'use strict';

const { objectValue, textValue, enumValue, listValue, objectOrEmpty, isoDateOrNull } = require('./validation');

function normalizeCoordinationLocus(value) {
  const locus = objectValue(value, 'CoordinationLocus');
  return {
    locusId: textValue(locus.locusId, 'locusId'),
    scope: enumValue(locus.scope, { allowed: ['mission', 'workspace', 'persistent'], field: 'scope', fallback: 'mission' }),
    holderNodeId: textValue(locus.holderNodeId, 'holderNodeId'),
    authorityBounds: objectOrEmpty(locus.authorityBounds, 'authorityBounds'),
    reason: textValue(locus.reason, 'reason'),
    leaseUntil: isoDateOrNull(locus.leaseUntil, 'leaseUntil'),
    transferConditions: listValue(locus.transferConditions, 'transferConditions')
  };
}

module.exports = { normalizeCoordinationLocus };
