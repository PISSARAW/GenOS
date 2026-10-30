'use strict';

function mainValue1(__genosValueScope1) {
  return { action: __genosValueScope1.receipt.decision.action, recipients: __genosValueScope1.receipt.decision.recipients || [],
      semanticRefs: __genosValueScope1.delivered?.envelope?.semanticRefs
        || __genosValueScope1.signals.flatMap((signal) => signal.communicationEnvelope?.semanticRefs || []) };
}

module.exports = { mainValue1 };
