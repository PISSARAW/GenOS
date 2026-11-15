'use strict';

function mainRule1(context) {
  return { action: context.decision.action, recipients: context.decision.recipients || [],
      semanticRefs: context.delivered?.envelope?.semanticRefs
        || context.signals.flatMap((signal) => signal.communicationEnvelope?.semanticRefs || []) };
}

function mainRule2(context) {
  return context.observed.action === context.EXPECTED.action
      && context.JSON.stringify(context.observed.recipients) === context.JSON.stringify(context.EXPECTED.recipients)
      && context.JSON.stringify(context.observed.semanticRefs) === context.JSON.stringify(context.EXPECTED.semanticRefs);
}

module.exports = { mainRule1, mainRule2 };
