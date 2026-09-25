'use strict';

const morphogenesis = require('../integration/biocenoseMorphogenesisAdapter');

const RECEIPT_INDEX = Object.freeze({ verification: 2, independence: 5, aggregation: 6, dissent: 7, judgment: 8 });

function evaluate(input) {
  const receipts = input.receipts || [];
  const reports = readReports(receipts);
  const observation = observe(input, reports);
  const transition = morphogenesis.recommend({
    currentTopology: 'biocenose',
    ...morphogenesis.signalsFromJudgment(reports.judgment),
    executionNeeded: input.executionNeeded === true
  });
  return {
    communityId: input.communityId,
    round: input.round,
    observation,
    transition,
    nextAction: selectAction(observation, transition)
  };
}

function readReports(receipts) {
  return Object.fromEntries(Object.entries(RECEIPT_INDEX).map(([key, index]) => [
    key, receipts[index]?.result || {}
  ]));
}

function observe(input, reports) {
  return {
    ...independenceObservation(reports.independence),
    ...communityObservation(input.session),
    ...claimObservation(reports),
    ...dissentObservation(reports.dissent),
    ...decisionObservation(reports),
    executionLevel: input.variantPolicy.executionLevel
  };
}

function independenceObservation(report) {
  return {
    effectiveCommunitySize: report.report?.effectiveSize ?? null,
    independenceMeasured: report.report?.measured === true
  };
}

function communityObservation(session) {
  return { activeMemberCount: (session.members || []).filter(isActiveMember).length };
}

function isActiveMember(member) {
  return member.status === 'ACTIVE';
}

function claimObservation(reports) {
  const claims = reports.aggregation.claims || [];
  const verifiedClaimIds = new Set((reports.verification.verificationReceipts || [])
    .filter((item) => item.status === 'VERIFIED').map((item) => item.claimId));
  return {
    claimCount: claims.length,
    verifiedClaimCount: verifiedClaimIds.size,
    unresolvedClaimCount: (reports.aggregation.unresolvedClaimIds || []).length
  };
}

function dissentObservation(report) {
  const gates = report.gates || [];
  return { openDissentCount: gates.filter(isOpenGate).length };
}

function isOpenGate(gate) {
  return gate.promotion !== 'ALLOWED';
}

function decisionObservation(reports) {
  const judgment = reports.judgment.judgment || reports.judgment;
  return {
    judgmentStatus: judgment.status || null,
    judgmentOutcome: judgment.aggregation?.outcome || reports.aggregation.outcome || null
  };
}

function selectAction(observation, transition) {
  return actionRules(observation, transition).find((item) => item.when)?.action || 'NO_FURTHER_ACTION';
}

function actionRules(observation, transition) {
  return [
    { when: transition?.destination === 'human', action: 'HANDOFF_HUMAN_REVIEW' },
    { when: transition?.target === 'trinity', action: 'REQUEST_MORPHOGENESIS_EXPERIMENT' },
    { when: observation.openDissentCount > 0, action: 'PRESERVE_DISSENT_AND_REVIEW' },
    { when: transition?.destination === 'direct', action: 'HANDOFF_DIRECT' },
    { when: observation.judgmentOutcome === 'REVIEW_REQUIRED', action: 'CONTINUE_VERIFICATION' },
    { when: isLowIndependence(observation), action: 'REQUEST_INDEPENDENT_REVIEWERS' },
    { when: needsIndependenceEvidence(observation), action: 'COLLECT_INDEPENDENCE_EVIDENCE' },
    { when: isUnresolvedAtLimit(observation), action: 'ESCALATE_ROUND_LIMIT' },
    { when: Boolean(transition), action: 'APPLY_MORPHOGENESIS_RECOMMENDATION' }
  ];
}

function isLowIndependence(observation) {
  return observation.independenceMeasured && observation.effectiveCommunitySize < 2;
}

function needsIndependenceEvidence(observation) {
  return !observation.independenceMeasured && observation.activeMemberCount > 1;
}

function isUnresolvedAtLimit(observation) {
  return observation.roundLimitReached && observation.judgmentStatus !== 'DECIDED';
}

module.exports = { evaluate };
