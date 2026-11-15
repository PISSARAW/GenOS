'use strict';

function isAcceptedHandoffInputRule1(context) {
  return context.evaluation.passed !== true || !/^[a-f0-9]{64}$/i.test(context.String(context.evaluation.digest || ''))
      || !context.Number.isSafeInteger(context.evaluation.version) || context.evaluation.version < 1
      || !context.Array.isArray(context.evaluation.evidenceRefs) || context.evaluation.evidenceRefs.length === 0;
}

function isAcceptedHandoffInputRule2(context) {
  return context.evaluations.some((evaluation) => {
    if (context.require('./aTeamIntegrationObserverRules.js').isAcceptedHandoffInputRule1({ Array: context.Array, Number: context.Number, String: context.String, evaluation })) return false;
    const identity = /^work:([^:]+):\d+->work:([^:]+):\d+:\d+$/.exec(evaluation.handoffId || '');
    if (!identity || identity[2] !== context.targetId) return false;
    const producer = context.membersById.get(identity[1]);
    const producerId = producer?.agentId || producer?.workerId;
    if (!producerId || !context.ownerIds.includes(producerId)) return false;
    const producerReport = context.latestReport(context.byWorker.get(producerId));
    return (context.Array.isArray(producerReport?.artifacts) ? producerReport.artifacts : [])
      .some((item) => context.artifactKey(item) === context.artifact);
  });
}

module.exports = { isAcceptedHandoffInputRule1, isAcceptedHandoffInputRule2 };
