'use strict';

const assert = require('node:assert/strict');
const { qualifyPhase7Release } = require('./phase7ReleaseGate.cjs');

const COMMIT = 'release-2026-10-18';

function receipt(id) {
  return { verified: true, realExecution: true, evidenceRef: `sha256:${id}`,
    observedAt: '2026-10-18T12:00:00.000Z' };
}

function artifact() {
  return { immutable: true, replayVerified: true, sourceCommit: COMMIT,
    digest: `sha256:${'a'.repeat(64)}`, manifestHash: `sha256:${'b'.repeat(64)}` };
}

function input() {
  return {
    phase: 'release-review', sourceClean: true, releaseCommit: COMMIT,
    p6: { status: 'eligible', universalGeneralization: false }, releaseArtifact: artifact(),
    independentReplications: [
      { status: 'passed', realExecution: true, sourceCommit: COMMIT, operatorId: 'operator-a', environmentId: 'cloud-a', artifact: artifact(), receipt: receipt('a') },
      { status: 'passed', realExecution: true, sourceCommit: COMMIT, operatorId: 'operator-b', environmentId: 'cloud-b', artifact: artifact(), receipt: receipt('b') }
    ],
    rollbackDrill: { executed: true, verified: true, recoveryTimeMs: 800,
      rollbackReceipt: receipt('rollback') },
    negativeControls: [{ passed: true, receipt: receipt('negative-a') }, { passed: true, receipt: receipt('negative-b') }],
    openIncidents: 0,
    governanceReview: { evidenceReview: true, securityReview: true, reproducibilityReview: true }
  };
}

function run() {
  const reviewable = qualifyPhase7Release(input());
  assert.equal(reviewable.status, 'reviewable');
  assert.equal(reviewable.promotionReviewEligible, true);
  assert.equal(reviewable.runtimePromotionAuthorized, false);
  assert.equal(reviewable.universalGeneralization, false);
  assert.equal(reviewable.independentReplicationCount, 2);
  assert.equal(reviewable.rollbackVerified, true);

  const blocked = qualifyPhase7Release({ ...input(), openIncidents: 1 });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('open_incidents_present'));

  const incomplete = qualifyPhase7Release({ ...input(), independentReplications: [input().independentReplications[0]] });
  assert.ok(incomplete.blockers.includes('independent_replications_missing'));
  assert.ok(incomplete.blockers.includes('independent_operator_coverage_missing'));
  console.log('Phase 7 independent replication and release gate: PASS');
}

run();
