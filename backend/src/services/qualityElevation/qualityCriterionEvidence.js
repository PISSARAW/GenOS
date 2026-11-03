'use strict';

function witnessed(criterion, evaluation) {
  const reviews = evaluation.reviews || [];
  return reviews.length > 0 && reviews.every(review =>
    review.checks.some(check => check.criterionId === criterion && check.verdict === 'pass' && check.evidence.length > 0));
}

function attach(mission, report) {
  const criteria = mission.missionCriteria || [];
  if (!criteria.length) return report;
  const receipt = report.qualityElevationReceipt;
  const text = require('./workerQualityContractEnforcer').extractTargetContent(report, report.workerArtifact);
  const evaluation = require('./qualityReceiptIntegrity').assertReceipt(receipt, {
    worker: mission, text, artifact: report.workerArtifact });
  const reference = `genos://quality-receipt/${receipt.receiptId}`;
  report.reportedAcceptanceEvaluations = report.acceptanceEvaluations || [];
  report.acceptanceEvaluations = criteria.map(criterion => ({ criterion,
    passed: witnessed(criterion, evaluation) ? true : null, evidenceRefs: [reference] }));
  report.tests = [...(report.tests || []), { name: 'native_independent_quality_review',
    passed: true, evidence: [reference], receiptDigest: require('./qualityContract').digest(receipt) }];
  return report;
}

module.exports = { attach };
