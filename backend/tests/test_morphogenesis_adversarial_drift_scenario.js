'use strict';

const assert = require('node:assert/strict');
const { compileConditionalMorphogenesisPolicy, reevaluateConditionalMorphogenesisPolicy }
  = require('../src/services/morphogenesis/conditionalMorphogenesisPolicy');
const { critiqueStrategy } = require('../src/services/morphogenesis/strategyCritiqueService');
const { calculateMorphologicalEfficiency } = require('../src/services/morphogenesis/benchmark/morphologyMetrics');
const { registerRoundResult } = require('../src/services/agentRoundService');
const { autonomousRounds } = require('../src/services/agentOrchestrationState');

const context = { mission: 'Diagnose a service incident under changing evidence', currentTopology: 'a_team',
  currentVariant: 'default', budget: { tokens: 2400 }, maxEpochs: 4,
  availableWorkerKinds: ['scout_cell', 'verifier_worker'], availableCapabilities: ['observe', 'verify'],
  operationalConstraints: { daemonAllowed: false } };

function initialDiagnosis() {
  return { provenanceRisk: 0.9, uncertainty: 0.2, causalAmbiguity: 0.3, adversarialRisk: 0.8 };
}

function reversedDiagnosis() {
  return { provenanceRisk: 0.1, uncertainty: 0.95, contradiction: 0.8,
    causalAmbiguity: 0.7, adversarialRisk: 0.9 };
}

function misleadingConsensus() {
  return critiqueStrategy({
    currentStrategy: { id: 'cached-consensus', hypothesis: 'The cached daemon finding is still valid.',
      falsifier: 'An independent replay disagrees.' },
    alternative: { id: 'fresh-replay', hypothesis: 'The task family shifted and the cache is stale.',
      falsifier: 'An independent replay reproduces the cache.' },
    reports: ['worker-a', 'worker-b', 'worker-c'].map(id => ({ id, sourceId: 'shared-daemon-cache',
      lineageId: 'daemon-run-17', evidenceRefs: ['cached-finding-9'], outcome: 'supports_current' })),
    challengeBudget: { tokens: 80, challengeCostTokens: 25, maxChallenges: 1 }
  });
}

function verifyDriftRecompilesMethod() {
  const first = compileConditionalMorphogenesisPolicy({ ...context, diagnosis: initialDiagnosis() });
  const next = reevaluateConditionalMorphogenesisPolicy({ policy: first, context,
    observation: reversedDiagnosis(), remainingBudget: { tokens: 900 },
    currentTopology: 'a_team', currentVariant: 'default' });
  assert.equal(first.decision.representation, 'provenance_graph');
  assert.equal(next.status, 'continue');
  assert.equal(next.changed, true, 'hidden task-family reversal must trigger policy recompilation');
  assert.equal(next.policy.decision.representation, 'hypothesis_set');
  assert.equal(next.policy.decision.budget.totalTokens, 900);
  assert.equal(next.policy.evidencePolicy.workerReportsAreDiagnosticOnly, true);
}

function verifyDeceptiveReportsCannotResolve() {
  const challenge = misleadingConsensus();
  assert.equal(challenge.status, 'challenge_authorized');
  assert.equal(challenge.evidence.correlatedConsensusRejected, true);
  assert.equal(challenge.evidence.reports.clusters.length, 1);
  assert.equal(challenge.promotionAuthorized, false);
  assert.equal(challenge.resolutionReceipt, null);
}

function verifyIndependentReplayResolvesOnlyItsClaim() {
  const unresolved = misleadingConsensus();
  const evidence = unresolved.evidence.reports;
  const accepted = critiqueStrategy({
    currentStrategy: { id: 'cached-consensus', hypothesis: 'The cached daemon finding is current.',
      falsifier: 'An independent replay disagrees.' },
    alternative: { id: 'fresh-replay', hypothesis: 'The cache is stale.',
      falsifier: 'An independent replay reproduces the cache.' },
    reports: evidence.clusters.flatMap(cluster => cluster.reportIds.map(id => ({ id,
      sourceId: 'shared-daemon-cache', lineageId: 'daemon-run-17', evidenceRefs: ['cached-finding-9'],
      outcome: 'supports_current' }))),
    independentObservation: { observationId: 'replay-22', sourceId: 'isolated-replay',
      evidenceRef: 'replay-output-22', independenceBasis: 'replay', verified: true,
      verifierReceiptId: 'receipt-22', outcome: 'supports_alternative' },
    challengeBudget: { tokens: 80, challengeCostTokens: 25, maxChallenges: 1 }
  });
  assert.equal(accepted.status, 'resolved_alternative');
  assert.equal(accepted.resolutionReceipt.verifierReceiptId, 'receipt-22');
  assert.equal(accepted.promotionAuthorized, false, 'a critique receipt alone does not authorize promotion');
  const verifiedProgress = accepted.resolutionReceipt?.verifierReceiptId ? 1 : 0;
  const efficiency = calculateMorphologicalEfficiency({ verifiedUsefulProgress: verifiedProgress,
    compute: 25, communication: 0, coordination: 0, transitionCost: 0 });
  assert.equal(efficiency, 1 / 25, 'score one deliverable only when an independent verifier receipt exists');
}

function verifyAdaptationWaitsForQuiescence() {
  const id = `drift-barrier-${Date.now()}`;
  const state = { epoch: 2, workerIds: new Set(['drift-a', 'drift-b']), results: new Map(), advanced: false };
  autonomousRounds.set(id, state);
  try {
    const first = registerRoundResult({ agentId: 'drift-a', budgetRound: {
      stage: 'morphogenesis_epoch', epoch: 2, orchestratorId: id } }, { eventType: 'AGENT_COMPLETED', payload: {} });
    assert.equal(first, null);
    assert.equal(state.advanced, false, 'one worker report cannot trigger adaptation while its peer is running');
    const last = registerRoundResult({ agentId: 'drift-b', budgetRound: {
      stage: 'morphogenesis_epoch', epoch: 2, orchestratorId: id } }, { eventType: 'AGENT_COMPLETED', payload: {} });
    assert.equal(last.state, state);
    assert.equal(state.advanced, true, 'adaptation becomes eligible only at the epoch quiescence barrier');
  } finally {
    autonomousRounds.delete(id);
  }
}

verifyDriftRecompilesMethod();
verifyDeceptiveReportsCannotResolve();
verifyIndependentReplayResolvesOnlyItsClaim();
verifyAdaptationWaitsForQuiescence();
process.stdout.write('morphogenesis adversarial drift scenario: 4 cases passed\n');
