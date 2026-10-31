'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.JSON.stringify(__genosValueScope1.observed) === __genosValueScope1.JSON.stringify(__genosValueScope1.expected)
      && __genosValueScope1.unverifiedRejected && __genosValueScope1.stored.metadata.trustByDomain[__genosValueScope1.DOMAIN] === __genosValueScope1.expected.trust
      && __genosValueScope1.stored.metadata.learningEvidence[__genosValueScope1.DOMAIN].length === 5;
}

module.exports = { mainValue1 };
