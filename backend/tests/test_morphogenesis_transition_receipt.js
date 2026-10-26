'use strict';

const assert = require('node:assert/strict');
const { sealTransitionReceipt, verifyTransitionReceipt, resultMatchesTransition } =
  require('../src/services/morphogenesis/morphogenesisTransitionReceipt');

function fixture() {
  const worker = { agentId: 'worker-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose',
    morphologyVariant: 'default' };
  const adaptation = { receipt: { candidateId: 'candidate-a', toGraph: { graphId: 'graph-a', version: 2 } },
    admission: { status: 'admitted', selectionBasis: 'calibrated_policy_proposal',
      recipe: { id: 'candidate-a', topology: 'biocenose', variant: 'default' },
      actualPlan: { workerAssignments: [{ workerId: 'worker-a', workerKind: 'scout_cell',
        topology: 'biocenose', variant: 'default', tokenBudget: 25 }] } },
    plan: { morphologyPatch: { graph: { graphId: 'graph-a', version: 2, nodes: [{ nodeId: 'n1' }] } } },
    assignments: { 'worker-a': { workerKind: 'scout_cell', morphologyTopology: 'biocenose',
      morphologyVariant: 'default' } } };
  const input = { state: { workers: new Map([[worker.agentId, worker]]) }, survivors: [worker], adaptation,
    continuation: { workerTokens: [25], perWorkerTokens: 25 } };
  return { worker, adaptation, input };
}

function run() {
  return verifySealedReceipt().then(verifyOracleBinding);
}

async function verifySealedReceipt() {
  const { adaptation, input } = fixture();
  const receipt = sealTransitionReceipt(input);
  receipt.dispatchStatus = 'queued';
  receipt.queuedWorkerIds = ['worker-a'];
  assert.equal(verifyTransitionReceipt(receipt), true);
  const result = { agentId: 'worker-a', transitionId: receipt.transitionId, workerKind: 'scout_cell',
    topology: 'biocenose', variant: 'default', allocatedTokens: 25 };
  assert.equal(resultMatchesTransition(result, receipt), true,
    'the same admitted graph, variant, and allocated worker are linked through the result');
  assert.equal(resultMatchesTransition({ ...result, topology: 'rhizome' }, receipt), false,
    'a worker launched with a different topology cannot inherit this transition verdict');
  assert.equal(resultMatchesTransition({ ...result, variant: 'resilient' }, receipt), false,
    'a worker launched with a different variant cannot inherit this transition verdict');
  const { variant, ...withoutVariant } = result;
  assert.equal(resultMatchesTransition(withoutVariant, receipt), false,
    'a worker result without its variant cannot satisfy the sealed transition');
  const transitionBoundResults = require('../src/services/morphogenesis/missionResolutionReceipt')
    .transitionBoundResults;
  const state = { plan: { morphogenesisEpochStatus: { transition: receipt } },
    results: new Map([['worker-a', { ...result, status: 'completed',
      declaredConsumedTokens: 12, declaredCostUsd: 0.2 }]]) };
  assert.equal(transitionBoundResults(state).length, 1);
  const observed = receipt.observed.workers[0];
  assert.equal(observed.declaredConsumedTokens, 12,
    'the receipt records worker-declared usage while keeping it distinct from allocation');
  assert.equal(observed.usageSource || receipt.observed.usageSource, 'worker_declared',
    'declared usage is labelled and never presented as accounting proof');
  assert.ok(!('consumedTokens' in observed) && !('costUsd' in observed),
    'no bare consumption field may suggest an accounting measure');
  state.results.set('worker-a', { ...result, topology: 'rhizome' });
  assert.equal(transitionBoundResults(state).length, 0,
    'a divergent result blocks the terminal promotion gate');
  receipt.identity.totalTokens += 1;
  assert.equal(verifyTransitionReceipt(receipt), false,
    'mutating the transition identity invalidates its digest');
  assert.ok(adaptation.receipt.transitionId);
}

function verifyIdentityCannotBeReplayedAcrossBindings() {
  const first = fixture();
  first.input.state.normalizedMission = { missionId: 'mission-a', prompt: 'same work' };
  const firstReceipt = sealTransitionReceipt(first.input);
  const otherMission = fixture();
  otherMission.input.state.normalizedMission = { missionId: 'mission-b', prompt: 'same work' };
  assert.notEqual(sealTransitionReceipt(otherMission.input).transitionId, firstReceipt.transitionId,
    'mission identity is part of the transition digest');
  const fallbackMission = fixture();
  fallbackMission.input.orchestratorId = 'orchestrator-a';
  const fallbackReceipt = sealTransitionReceipt(fallbackMission.input);
  assert.equal(fallbackReceipt.identity.mission.missionId, 'orchestrator-a',
    'mission identity falls back to the orchestrator ID used by the verifier');

  const swappedCandidate = fixture();
  swappedCandidate.adaptation.receipt.candidateId = 'candidate-b';
  assert.throws(() => sealTransitionReceipt(swappedCandidate.input),
    { code: 'MORPHOGENESIS_TRANSITION_CANDIDATE_DIVERGED' },
    'the receipt candidate cannot be replaced by another admitted candidate');

  const swappedRoster = fixture();
  swappedRoster.adaptation.admission.actualPlan = { workerAssignments: [{ workerId: 'worker-b' }] };
  assert.throws(() => sealTransitionReceipt(swappedRoster.input),
    { code: 'MORPHOGENESIS_TRANSITION_WORKERS_DIVERGED' },
    'the admitted worker roster must exactly match the bound survivors');

  const missingRoster = fixture();
  delete missingRoster.adaptation.admission.actualPlan;
  assert.throws(() => sealTransitionReceipt(missingRoster.input),
    { code: 'MORPHOGENESIS_TRANSITION_WORKERS_DIVERGED' },
    'a normal admitted transition without an admitted roster fails closed');
  const unidentifiedRoster = fixture();
  unidentifiedRoster.adaptation.admission.actualPlan.workerAssignments = [{ workerKind: 'scout_cell' }];
  assert.throws(() => sealTransitionReceipt(unidentifiedRoster.input),
    { code: 'MORPHOGENESIS_TRANSITION_WORKERS_DIVERGED' },
    'admitted workers without stable identities cannot be bound');
}

async function verifyOracleBinding() {
  const { input } = fixture();
  const receipt = sealTransitionReceipt(input);
  receipt.dispatchStatus = 'prepared';
  receipt.queuedWorkerIds = [];
  const { transitionBoundResults, verifiedResolution } =
    require('../src/services/morphogenesis/missionResolutionReceipt');
  const { bindVerifiedVerdict } = require('../src/services/morphogenesis/morphogenesisEpochEvidence');
  const bound = { plan: { morphogenesisEpochStatus: { transition: receipt } },
    results: new Map([['worker-a', { agentId: 'worker-a', transitionId: receipt.transitionId,
      workerKind: 'scout_cell', topology: 'biocenose', allocatedTokens: 25,
      status: 'completed', payload: {} }]]) };
  assert.equal(transitionBoundResults(bound).length, 0,
    'a sealed receipt alone never promotes before queue finalization');
  receipt.dispatchStatus = 'queued';
  receipt.queuedWorkerIds = ['worker-a'];
  const resolvable = { normalizedMission: { missionId: 'mission',
    workspaceRoot: process.cwd(), verifierChecks: [{ program: 'node', args: ['-v'] }] },
    plan: { morphogenesisEpochStatus: { transition: receipt } },
    results: new Map([['worker-a', { agentId: 'worker-a', transitionId: receipt.transitionId,
      workerKind: 'scout_cell', topology: 'biocenose', allocatedTokens: 25,
      status: 'completed', payload: {} }]]) };
  assert.equal(await verifiedResolution(resolvable, 'mission'), null,
    'a completed worker report without an independent oracle receipt stays diagnostic');
  const mismatched = { plan: { morphogenesisEpochStatus: { transition: { transitionId: 'morph_a' } } } };
  bindVerifiedVerdict(mismatched, { transitionId: 'morph_b', receipt: { receiptDigest: 'digest' },
    agentId: 'worker-a' });
  assert.deepEqual(mismatched.plan.morphogenesisEpochStatus.transition.verdict,
    { status: 'blocked', reason: 'transition_identity_mismatch' },
    'an oracle verdict bound to another transition cannot promote');
  const matched = { plan: { morphogenesisEpochStatus: { transition: { transitionId: 'morph_a' } } } };
  bindVerifiedVerdict(matched, { transitionId: 'morph_a', receipt: { receiptDigest: 'digest' },
    agentId: 'worker-a' });
  assert.equal(matched.plan.morphogenesisEpochStatus.transition.verdict.status, 'verified',
    'only an oracle verdict bound to the same transitionId promotes');
  console.log('Morphogenesis transition receipt binds admission, graph, recruited worker, budget, and result: PASS');
  console.log('Observability is declared usage only; sealed receipt alone never resolves without a bound oracle verdict: PASS');
}

verifyIdentityCannotBeReplayedAcrossBindings();
run().catch((error) => { console.error(error); process.exitCode = 1; });
