'use strict';

const assert = require('node:assert/strict');
const { sealTransitionReceipt, verifyTransitionReceipt } = require('../src/services/morphogenesis/morphogenesisTransitionReceipt');

function inputWithEffect() {
  const transitionId = 'graph-1:2';
  const candidateId = 'resource-reallocation:sha256:plan';
  const planDigest = 'sha256:plan';
  const worker = { agentId: 'worker-a', workerKind: 'scout_cell',
    morphologyTopology: 'a_team', morphologyVariant: 'stable' };
  const receipt = { transitionId,
    resourceAllocationBinding: { candidateId, planDigest, transitionId },
    resourceAllocationEffect: { status: 'applied', candidateId, planDigest, transitionId,
      budgetTokens: 30, allocatedTokens: 15,
      workerTokenAllocations: [{ workerId: worker.agentId, tokens: 15 }] } };
  return { state: { workers: new Map([[worker.agentId, worker]]) }, survivors: [worker],
    continuation: { workerTokens: [15] }, adaptation: {
      receipt, admission: { status: 'admitted', selectionBasis: 'conditional_policy',
        recipe: { id: 'cohort:a_team:stable', topology: 'a_team', variant: 'stable' },
        executionAuthorized: true, gates: { budget: true }, actualPlan: {
          selectedTopology: 'a_team', selectedVariant: 'stable', strategyRecipeId: 'cohort:a_team:stable',
          allocatedTokens: 15, requestedTools: [], workerAssignments: [{ workerId: 'worker-a',
            workerKind: 'scout_cell', topology: 'a_team', variant: 'stable', tokenBudget: 15 }]
        } },
      decision: { resources: { candidate: { candidateId, planDigest } }, policy: { decision: {
        interventionScale: 'RESOURCE_REALLOCATION',
        recipe: { resourceAllocationIntervention: { candidateId } }
      } } }, plan: { morphologyPatch: { graph: { graphId: 'graph-1', version: 2, nodes: [], edges: [] } } }
    } };
}

function testFinalSealBindsResourceEffectAndWorkers() {
  const input = inputWithEffect();
  const receipt = sealTransitionReceipt(input);
  assert.match(receipt.transitionId, /^morph_[a-f0-9]{64}$/);
  assert.equal(receipt.resourceAllocationBinding.transitionId, receipt.transitionId);
  assert.equal(receipt.resourceAllocationEffect.transitionId, receipt.transitionId);
  assert.equal(receipt.identity.resourceAllocation.candidateId, 'resource-reallocation:sha256:plan');
  assert.equal(receipt.identity.resourceAllocation.effect.allocatedTokens, 15);
  assert.deepEqual(receipt.identity.resourceAllocation.effect.workerTokenAllocations,
    [{ workerId: 'worker-a', tokens: 15 }]);
  assert.equal(verifyTransitionReceipt(receipt), true);

  receipt.resourceAllocationEffect.transitionId = 'old-provisional-id';
  assert.equal(verifyTransitionReceipt(receipt), false, 'a stale effect transition id invalidates the sealed receipt');

  const admissionReceipt = sealTransitionReceipt(inputWithEffect());
  admissionReceipt.strategyAdmission.gates.budget = false;
  assert.equal(verifyTransitionReceipt(admissionReceipt), false, 'admission divergence invalidates the sealed receipt');

  const budgetReceipt = sealTransitionReceipt(inputWithEffect());
  budgetReceipt.resourceAllocationEffect.workerTokenAllocations[0].tokens = 14;
  assert.equal(verifyTransitionReceipt(budgetReceipt), false, 'worker token divergence invalidates the sealed receipt');

  const candidateReceipt = sealTransitionReceipt(inputWithEffect());
  candidateReceipt.resourceAllocationBinding.candidateId = 'another-candidate';
  assert.equal(verifyTransitionReceipt(candidateReceipt), false, 'candidate divergence invalidates the sealed receipt');
}

function testSealRejectsEffectWorkerDivergence() {
  const input = inputWithEffect();
  input.adaptation.receipt.resourceAllocationEffect.workerTokenAllocations[0].workerId = 'other-worker';
  assert.throws(() => sealTransitionReceipt(input), { code: 'MORPHOGENESIS_RESOURCE_EFFECT_WORKERS_DIVERGED' });
}

testFinalSealBindsResourceEffectAndWorkers();
testSealRejectsEffectWorkerDivergence();
process.stdout.write('resource transition receipt tests passed\n');
