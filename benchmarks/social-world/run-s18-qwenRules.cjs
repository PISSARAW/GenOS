'use strict';

function main(context) {
  return context.Boolean(context.observed) && context.JSON.stringify({ type: context.observed.type, locus: context.observed.locus,
      senderAgentId: context.observed.senderAgentId, semanticRefs: context.observed.semanticRefs }) === context.JSON.stringify(context.EXPECTED)
      && context.observed.localOnly === false && context.observed.isRepellent === true;
}

module.exports = { main };
