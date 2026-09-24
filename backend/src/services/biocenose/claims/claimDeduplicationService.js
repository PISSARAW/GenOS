'use strict';

function duplicateFor(claims, candidate) {
  return claims.find((claim) => claim.canonicalKey === candidate.canonicalKey) || null;
}

module.exports = { duplicateFor };
