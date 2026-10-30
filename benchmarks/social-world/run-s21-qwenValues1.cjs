'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.observed.symbol === __genosValueScope1.EXPECTED.symbol && __genosValueScope1.observed.canonicalMeaning === __genosValueScope1.EXPECTED.canonicalMeaning
      && __genosValueScope1.observed.fallbackRequired && __genosValueScope1.observed.semanticFingerprint === __genosValueScope1.fingerprint;
}

module.exports = { mainValue1 };
