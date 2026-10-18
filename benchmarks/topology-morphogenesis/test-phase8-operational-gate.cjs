'use strict';

const assert = require('node:assert/strict');
const { qualifyPhase8Operations } = require('./phase8OperationalGate.cjs');

function receipt(id) {
  return { verified: true, realExecution: true, evidenceRef: `sha256:${id}`,
    observedAt: '2026-10-18T13:00:00.000Z' };
}

function canary(windowId, environmentId, driftScore = 0.1) {
  return { windowId, environmentId, outcome: 'passed', rollbackReady: true, receipt: receipt(windowId),
    metrics: { successRate: 0.96, errorRate: 0.02, p95LatencyMs: 180, costPerTask: 0.04, driftScore } };
}

function input() {
  return { phase: 'post-release', sourceClean: true, releaseCommit: 'release-2026-10-18',
    p7: { status: 'reviewable', universalGeneralization: false }, requiredCanaryRuns: 3,
    requiredWindows: 3, requiredEnvironments: 2,
    limits: { maxErrorRate: 0.05, maxP95LatencyMs: 250, maxCostPerTask: 0.1, maxDriftScore: 0.2 },
    canaryRuns: [canary('w1', 'cloud-a'), canary('w2', 'cloud-a'), canary('w3', 'cloud-b')],
    monitoring: { telemetryVerified: true, alertRulesLoaded: true, sampleCount: 300 },
    incidents: [{ incidentId: 'closed-1', open: false }] };
}

function run() {
  const observed = qualifyPhase8Operations(input());
  assert.equal(observed.status, 'observed');
  assert.equal(observed.continuedOperationEligible, true);
  assert.equal(observed.continuousPromotionAuthorized, false);
  assert.equal(observed.runtimePromotionAuthorized, false);
  assert.equal(observed.universalGeneralization, false);
  assert.equal(observed.scope.windows.length, 3);

  const drifted = qualifyPhase8Operations({ ...input(), canaryRuns: [canary('w1', 'cloud-a', 0.4), ...input().canaryRuns.slice(1)] });
  assert.equal(drifted.status, 'blocked');
  assert.ok(drifted.blockers.includes('canary_slo_or_receipt_failed'));

  const incident = qualifyPhase8Operations({ ...input(), incidents: [{ incidentId: 'open-1', open: true }] });
  assert.ok(incident.blockers.includes('open_operational_incident'));
  console.log('Phase 8 post-release canary and drift gate: PASS');
}

run();
