'use strict';

function main(context) {
  return context.decision.scope === 'GLOBAL_BROADCAST'
      && context.JSON.stringify(context.observed.recipients) === context.JSON.stringify(context.EXPECTED.recipients)
      && !context.observed.recipients.includes('agent-d')
      && new context.Set(context.observed.recipients).size === context.observed.recipients.length
      && context.JSON.stringify(context.observed.acknowledgements) === context.JSON.stringify(context.EXPECTED.recipients)
      && context.outcome.grounding.satisfied
      && context.JSON.stringify(context.observed.semanticRefs) === context.JSON.stringify(context.EXPECTED.semanticRefs);
}

module.exports = { main };
