'use strict';

function main(context) {
  return context.JSON.stringify(context.observed) === context.JSON.stringify(context.expected)
      && context.unverifiedRejected && context.stored.metadata.trustByDomain[context.DOMAIN] === context.expected.trust
      && context.stored.metadata.learningEvidence[context.DOMAIN].length === 5;
}

module.exports = { main };
