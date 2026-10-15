'use strict';

const assert = require('node:assert/strict');
const { critiqueStrategy } = require('../src/services/morphogenesis/strategyCritiqueService');

const base = {
  currentStrategy: { id: 'consensus', hypothesis: 'The shared daemon finding is current.',
    falsifier: 'A replay against the source data disagrees.' },
  alternative: { id: 'stale-daemon', hypothesis: 'The daemon finding is stale.',
    falsifier: 'An independent replay reproduces the finding.' },
  reports: [
    { id: 'worker-a', sourceId: 'daemon-cache', lineageId: 'daemon-run-7', evidenceRefs: ['finding-17'], outcome: 'supports_current' },
    { id: 'worker-b', sourceId: 'worker-b', lineageId: 'daemon-run-7', evidenceRefs: ['finding-17'], outcome: 'supports_current' },
    { id: 'worker-c', sourceId: 'worker-c', lineageId: 'daemon-run-7', evidenceRefs: ['finding-17'], outcome: 'supports_current' }
  ],
  challengeBudget: { tokens: 40, challengeCostTokens: 25, maxChallenges: 1 }
};

function rejectsCorrelatedConsensus() {
  const result = critiqueStrategy(base);
  assert.equal(result.status, 'challenge_authorized');
  assert.equal(result.evidence.reports.reportCount, 3);
  assert.equal(result.evidence.reports.clusters.length, 1, 'shared daemon lineage collapses the votes into one source');
  assert.equal(result.evidence.correlatedConsensusRejected, true);
  assert.equal(result.challenge.reservedTokens, 25);
  assert.equal(result.challenge.remainingTokens, 15);
  assert.equal(result.promotionAuthorized, false);
}

function independentObservationCanResolve() {
  const result = critiqueStrategy({ ...base, independentObservation: {
    observationId: 'replay-91', sourceId: 'replay-worker', evidenceRef: 'replay-result-91',
    independenceBasis: 'replay', verified: true, verifierReceiptId: 'receipt-91',
    outcome: 'supports_alternative'
  } });
  assert.equal(result.status, 'resolved_alternative');
  assert.equal(result.evidence.independentObservationAccepted, true);
  assert.equal(result.resolutionReceipt.verifierReceiptId, 'receipt-91');
  assert.equal(result.challenge.authorized, false);
}

function rejectsUnverifiableIndependenceAndEnforcesBudget() {
  const claimedOnly = critiqueStrategy({ ...base, independentObservation: {
    observationId: 'replay-92', sourceId: 'other-worker', evidenceRef: 'replay-result-92',
    independenceBasis: 'replay', verified: false, outcome: 'supports_alternative'
  } });
  assert.equal(claimedOnly.status, 'challenge_authorized');
  assert.equal(claimedOnly.evidence.independentObservationAccepted, false);
  const noBudget = critiqueStrategy({ ...base, challengeBudget: { tokens: 20, challengeCostTokens: 25, maxChallenges: 1 } });
  assert.equal(noBudget.status, 'challenge_budget_exhausted');
  assert.equal(noBudget.challenge.authorized, false);
}

function incompleteProvenanceDoesNotCreateIndependentSupport() {
  const result = critiqueStrategy({ ...base, reports: [
    { id: 'unattributed-1', outcome: 'supports_current' },
    { id: 'unattributed-2', outcome: 'supports_current' }
  ] });
  assert.equal(result.evidence.reports.independentSupport.current, 0);
  assert.equal(result.evidence.reports.clusters.every(cluster => cluster.outcome === 'provenance_incomplete'), true);
  assert.equal(result.status, 'challenge_authorized');
}

rejectsCorrelatedConsensus();
independentObservationCanResolve();
rejectsUnverifiableIndependenceAndEnforcesBudget();
incompleteProvenanceDoesNotCreateIndependentSupport();
process.stdout.write('morphogenesis strategy critique: 4 cases passed\n');
