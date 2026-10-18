'use strict';

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function receiptReady(receipt) {
  return receipt?.verified === true && receipt?.realExecution === true
    && Boolean(receipt?.evidenceRef) && finite(Date.parse(receipt?.observedAt));
}

function artifactReady(artifact, releaseCommit) {
  return artifact?.immutable === true && artifact?.replayVerified === true
    && artifact?.sourceCommit === releaseCommit && /^sha256:[a-f0-9]{64}$/.test(artifact?.digest || '')
    && /^sha256:[a-f0-9]{64}$/.test(artifact?.manifestHash || '');
}

function replicationReady(replication, releaseCommit) {
  return replication?.status === 'passed' && replication?.realExecution === true
    && replication?.sourceCommit === releaseCommit && Boolean(replication?.operatorId)
    && Boolean(replication?.environmentId) && artifactReady(replication.artifact, releaseCommit)
    && receiptReady(replication.receipt);
}

function baseBlockers(input) {
  const blockers = [];
  if (input.phase !== 'release-review') blockers.push('release_review_phase_required');
  if (input.sourceClean !== true) blockers.push('source_tree_dirty');
  if (input.p6?.status !== 'eligible') blockers.push('phase6_not_eligible');
  if (input.p6?.universalGeneralization !== false) blockers.push('phase6_scope_not_bounded');
  if (!input.releaseCommit) blockers.push('release_commit_missing');
  return blockers;
}

function replicationBlockers(input) {
  const replications = Array.isArray(input.independentReplications) ? input.independentReplications : [];
  const commit = input.releaseCommit;
  const operators = unique(replications.map(replication => replication.operatorId));
  const environments = unique(replications.map(replication => replication.environmentId));
  const blockers = [];
  if (replications.length < 2 || replications.some(replication => !replicationReady(replication, commit))) {
    blockers.push('independent_replications_missing');
  }
  if (operators.length < 2) blockers.push('independent_operator_coverage_missing');
  if (environments.length < 2) blockers.push('independent_environment_coverage_missing');
  return blockers;
}

function recoveryReady(recovery) {
  return recovery?.executed === true && recovery?.verified === true
    && recovery?.rollbackReceipt && receiptReady(recovery.rollbackReceipt)
    && finite(recovery.recoveryTimeMs);
}

function controlBlockers(input) {
  const controls = Array.isArray(input.negativeControls) ? input.negativeControls : [];
  const recovery = input.rollbackDrill;
  const blockers = [];
  if (!recoveryReady(recovery)) blockers.push('rollback_drill_missing');
  if (controls.length < 2 || controls.some(control => control.passed !== true
    || !receiptReady(control.receipt))) blockers.push('negative_controls_incomplete');
  if (Number(input.openIncidents) !== 0) blockers.push('open_incidents_present');
  return blockers;
}

function governanceBlockers(input) {
  const review = input.governanceReview || {};
  const artifact = input.releaseArtifact;
  const blockers = [];
  if (!artifactReady(artifact, input.releaseCommit)) blockers.push('release_artifact_unverified');
  if (review.evidenceReview !== true || review.securityReview !== true
    || review.reproducibilityReview !== true) blockers.push('governance_reviews_incomplete');
  return blockers;
}

function qualifyPhase7Release(input = {}) {
  const blockers = [...baseBlockers(input), ...replicationBlockers(input),
    ...controlBlockers(input), ...governanceBlockers(input)];
  const replications = Array.isArray(input.independentReplications) ? input.independentReplications : [];
  return {
    schema: 'genos.morphogenesis.phase7-release-gate/v1',
    status: blockers.length ? 'blocked' : 'reviewable',
    scope: { releaseCommit: input.releaseCommit || null,
      operators: unique(replications.map(replication => replication.operatorId)),
      environments: unique(replications.map(replication => replication.environmentId)) },
    blockers,
    independentReplicationCount: replications.length,
    rollbackVerified: recoveryReady(input.rollbackDrill),
    negativeControlsPassed: Array.isArray(input.negativeControls)
      && input.negativeControls.length >= 2
      && input.negativeControls.every(control => control.passed === true),
    promotionReviewEligible: blockers.length === 0,
    runtimePromotionAuthorized: false,
    universalGeneralization: false,
    caveat: 'Reviewable signifie que les preuves de réplication et de récupération sont complètes pour ce commit et ce périmètre; la promotion reste soumise à la gouvernance et ne prouve pas une généralisation universelle.'
  };
}

module.exports = { qualifyPhase7Release, artifactReady, replicationReady };
