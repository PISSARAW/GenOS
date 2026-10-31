'use strict';

function isAcceptedHandoffInputValue1(__genosValueScope1) {
  return __genosValueScope1.evaluation.passed !== true || !/^[a-f0-9]{64}$/i.test((0, __genosValueScope1.String)(__genosValueScope1.evaluation.digest || ''))
      || !__genosValueScope1.Number.isSafeInteger(__genosValueScope1.evaluation.version) || __genosValueScope1.evaluation.version < 1
      || !__genosValueScope1.Array.isArray(__genosValueScope1.evaluation.evidenceRefs) || __genosValueScope1.evaluation.evidenceRefs.length === 0;
}

function isAcceptedHandoffInputValue2(__genosValueScope2) {
  return __genosValueScope2.evaluations.some((evaluation) => {
    if ((0, __genosValueScope2.require)('./aTeamIntegrationObserverValues1.js').isAcceptedHandoffInputValue1({ Array: __genosValueScope2.Array, Number: __genosValueScope2.Number, String: __genosValueScope2.String, evaluation })) return false;
    const identity = /^work:([^:]+):\d+->work:([^:]+):\d+:\d+$/.exec(evaluation.handoffId || '');
    if (!identity || identity[2] !== __genosValueScope2.targetId) return false;
    const producer = __genosValueScope2.membersById.get(identity[1]);
    const producerId = producer?.agentId || producer?.workerId;
    if (!producerId || !__genosValueScope2.ownerIds.includes(producerId)) return false;
    const producerReport = (0, __genosValueScope2.latestReport)(__genosValueScope2.byWorker.get(producerId));
    return (__genosValueScope2.Array.isArray(producerReport?.artifacts) ? producerReport.artifacts : [])
      .some((item) => (0, __genosValueScope2.artifactKey)(item) === __genosValueScope2.artifact);
  });
}

module.exports = { isAcceptedHandoffInputValue1, isAcceptedHandoffInputValue2 };
