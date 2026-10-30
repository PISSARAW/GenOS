'use strict';

function mainValue1(__genosValueScope1) {
  return { action: __genosValueScope1.decision.action, recipients: __genosValueScope1.decision.recipients || [],
      semanticRefs: __genosValueScope1.delivered?.envelope?.semanticRefs
        || __genosValueScope1.signals.flatMap((signal) => signal.communicationEnvelope?.semanticRefs || []) };
}

function mainValue2(__genosValueScope2) {
  return __genosValueScope2.observed.action === __genosValueScope2.EXPECTED.action
      && __genosValueScope2.JSON.stringify(__genosValueScope2.observed.recipients) === __genosValueScope2.JSON.stringify(__genosValueScope2.EXPECTED.recipients)
      && __genosValueScope2.JSON.stringify(__genosValueScope2.observed.semanticRefs) === __genosValueScope2.JSON.stringify(__genosValueScope2.EXPECTED.semanticRefs);
}

module.exports = { mainValue1, mainValue2 };
