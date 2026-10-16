'use strict';

const assert = require('node:assert/strict');
const { sealTransitionReceipt, verifyTransitionReceipt, resultMatchesTransition } =
  require('../src/services/morphogenesis/morphogenesisTransitionReceipt');

function fixture() {
  const worker = { agentId: 'worker-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose',
    morphologyVariant: 'default' };
  const adaptation = { receipt: { candidateId: 'candidate-a', toGraph: { graphId: 'graph-a', version: 2 } },
    admission: { status: 'admitted', selectionBasis: 'calibrated_policy_proposal',
      recipe: { id: 'candidate-a', topology: 'biocenose', variant: 'default' } },
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
    topology: 'biocenose', allocatedTokens: 25 };
  assert.equal(resultMatchesTransition(result, receipt), true,
    'the same admitted graph and allocated worker are linked through the result');
  assert.equal(resultMatchesTransition({ ...result, topology: 'rhizome' }, receipt), false,
    'a worker launched with a different topology cannot inherit this transition verdict');
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

run().catch((error) => { console.error(error); process.exitCode = 1; });
