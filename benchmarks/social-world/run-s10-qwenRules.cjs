'use strict';

function main(context) {
  return { action: context.receipt.decision.action, recipients: context.receipt.decision.recipients || [],
      semanticRefs: context.delivered?.envelope?.semanticRefs
        || context.signals.flatMap((signal) => signal.communicationEnvelope?.semanticRefs || []) };
}

module.exports = { main };
