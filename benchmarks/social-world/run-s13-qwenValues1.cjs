'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.answer.resolution === 'corrected'
      && /closed/i.test(__genosValueScope1.answer.correctedStatement || '')
      && __genosValueScope1.answer.evidenceRef === 'evidence:bridge-status-19';
}

function mainValue2(__genosValueScope2) {
  return { action: __genosValueScope2.decision.action, recipients: __genosValueScope2.decision.recipients || [],
      semanticRefs: __genosValueScope2.delivered?.envelope?.semanticRefs
        || __genosValueScope2.signals.flatMap((signal) => signal.communicationEnvelope?.semanticRefs || []) };
}

function mainValue3(__genosValueScope3) {
  return __genosValueScope3.enginePass && __genosValueScope3.qwenPass && __genosValueScope3.reconciliationPass;
}

function mainValue4(__genosValueScope4) {
  return __genosValueScope4.answer.action === __genosValueScope4.observed.action
      && __genosValueScope4.JSON.stringify(__genosValueScope4.answer.recipients) === __genosValueScope4.JSON.stringify(__genosValueScope4.observed.recipients)
      && __genosValueScope4.JSON.stringify(__genosValueScope4.answer.semanticRefs) === __genosValueScope4.JSON.stringify(__genosValueScope4.observed.semanticRefs);
}

module.exports = { mainValue1, mainValue2, mainValue3, mainValue4 };
