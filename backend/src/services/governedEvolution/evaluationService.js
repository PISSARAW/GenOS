'use strict';

const { digest } = require('./constitution');

function number(value) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : 0;
}

function identitiesAreIndependent(hypothesis, experiment) {
  const evaluatorId = String(experiment.evaluatorId || '').trim();
  const measurementOwnerId = String(experiment.measurementOwnerId || '').trim();
  return Boolean(evaluatorId && measurementOwnerId)
    && evaluatorId !== hypothesis.proposerId
    && measurementOwnerId !== hypothesis.proposerId;
}

function holdoutIsDisjoint(holdout) {
  const training = new Set(holdout.trainingCaseIds || []);
  return (holdout.caseIds || []).every((caseId) => !training.has(caseId));
}

function directBenefit(experiment) {
  return number(experiment.candidate?.responsibilitySuccessRate)
    - number(experiment.baseline?.responsibilitySuccessRate);
}

function evaluationChecks(hypothesis, experiment, policy) {
  const holdout = experiment.holdout || {};
  const receipts = experiment.candidate?.responsibilityReceiptIds || [];
  const benefit = directBenefit(experiment);
  return {
    independentEvaluator: identitiesAreIndependent(hypothesis, experiment),
    sealedHoldout: holdout.sealed === true && Boolean(holdout.resultHash),
    disjointHoldout: holdoutIsDisjoint(holdout),
    sufficientHoldout: (holdout.caseIds || []).length >= number(policy.minHoldoutCases || 3),
    responsibilityReceipts: receipts.length >= number(policy.minResponsibilityReceipts || 2),
    realResponsibilityBenefit: benefit >= number(policy.minDirectBenefit || 0.01),
    noSafetyRegression: number(experiment.candidate?.safetyViolations) <= number(experiment.baseline?.safetyViolations),
    metricNotSelfReported: experiment.candidate?.metricSource !== 'self_reported'
  };
}

function evaluateOne(hypothesis, experiment, policy) {
  const checks = evaluationChecks(hypothesis, experiment, policy);
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const evidence = {
    experimentId: experiment.experimentId || null,
    holdoutResultHash: experiment.holdout?.resultHash || null,
    responsibilityReceiptIds: experiment.candidate?.responsibilityReceiptIds || [],
    directBenefit: directBenefit(experiment),
    proxyDelta: number(experiment.candidate?.proxyScore) - number(experiment.baseline?.proxyScore)
  };
  return {
    hypothesisId: hypothesis.hypothesisId,
    status: failures.length ? 'REJECTED' : 'QUALIFIED',
    promotionEligible: false,
    checks,
    failures,
    evidence,
    evaluationHash: digest({ hypothesisId: hypothesis.hypothesisId, checks, evidence })
  };
}

function selectQualified(outcomes) {
  return outcomes
    .filter((outcome) => outcome.status === 'QUALIFIED')
    .sort((left, right) => right.evidence.directBenefit - left.evidence.directBenefit)[0] || null;
}

function evaluateHypotheses(input) {
  const experiments = new Map((input.experiments || []).map((item) => [item.hypothesisId, item]));
  const outcomes = (input.hypotheses || []).map((hypothesis) => evaluateOne(
    hypothesis,
    experiments.get(hypothesis.hypothesisId) || {},
    input.policy || {}
  ));
  const selected = selectQualified(outcomes);
  return {
    decision: selected ? 'REVIEW_REQUIRED' : 'NO_CHANGE',
    selectedHypothesisId: selected?.hypothesisId || null,
    promotionEligible: false,
    outcomes,
    failureArchive: outcomes.filter((outcome) => outcome.status === 'REJECTED')
  };
}

module.exports = { evaluateHypotheses, evaluationChecks };
