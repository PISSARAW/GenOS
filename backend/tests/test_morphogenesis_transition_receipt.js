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
    results: new Map([['worker-a', { ...result, status: 'completed', consumedTokens: 12, costUsd: 0.2 }]]) };
  assert.equal(transitionBoundResults(state).length, 1);
  assert.equal(receipt.observed.workers[0].consumedTokens, 12,
    'the receipt records worker-reported usage while keeping it distinct from allocation');
  state.results.set('worker-a', { ...result, topology: 'rhizome' });
  assert.equal(transitionBoundResults(state).length, 0,
    'a divergent result blocks the terminal promotion gate');
  receipt.identity.totalTokens += 1;
  assert.equal(verifyTransitionReceipt(receipt), false,
    'mutating the transition identity invalidates its digest');
  assert.ok(adaptation.receipt.transitionId);
  console.log('Morphogenesis transition receipt binds admission, graph, recruited worker, budget, and result: PASS');
}

run();
