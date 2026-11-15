'use strict';

function main(context) {
  return context.observed.symbol === context.EXPECTED.symbol && context.observed.canonicalMeaning === context.EXPECTED.canonicalMeaning
      && context.observed.fallbackRequired && context.observed.semanticFingerprint === context.fingerprint;
}

module.exports = { main };
