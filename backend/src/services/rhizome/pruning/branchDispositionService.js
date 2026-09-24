'use strict';

function decide(input) {
  if (input.securityRisk || input.structurallyCritical) return 'FOSSILIZE';
  if (input.lowUtility && input.idle) return 'PRUNE';
  return 'DORMANT';
}

module.exports = { decide };
