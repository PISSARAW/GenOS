'use strict';

function mainRule1(context) {
  return context.answer.resolution === 'corrected'
      && /closed/i.test(context.answer.correctedStatement || '')
      && context.answer.evidenceRef === 'evidence:bridge-status-19';
}

function mainRule2(context) {
  return { action: context.decision.action, recipients: context.decision.recipients || [],
      semanticRefs: context.delivered?.envelope?.semanticRefs
        || context.signals.flatMap((signal) => signal.communicationEnvelope?.semanticRefs || []) };
}

function mainRule3(context) {
  return context.enginePass && context.qwenPass && context.reconciliationPass;
}

function mainRule4(context) {
  return context.answer.action === context.observed.action
      && context.JSON.stringify(context.answer.recipients) === context.JSON.stringify(context.observed.recipients)
      && context.JSON.stringify(context.answer.semanticRefs) === context.JSON.stringify(context.observed.semanticRefs);
}

module.exports = { mainRule1, mainRule2, mainRule3, mainRule4 };
