'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceContractService');
const completion = require('../src/services/missionCompletionContract');

function evaluateProof(source, budgetAssessment) {
  const missionId = 'mission-budget-proof';
  const content = { missionId, workerId: 'worker-budget-proof',
    result: { status: 'completed', verified: true },
    ...(budgetAssessment === undefined ? {} : { budgetAssessment }) };
  const proof = { reference: digest(content), content, source };
  return completion.evaluate({ missionId, lifecycleState: 'completed',
    requiredMemberIds: ['worker-budget-proof'],
    members: [{ memberId: 'worker-budget-proof', status: 'completed', evidenceRefs: [proof.reference] }],
    evidenceProofs: [proof], topologyValidation: { status: 'verified', reasons: [] },
    barrierStatus: 'complete' });
}

function biologicalReceiptsRequireSatisfiedBudget() {
  assert.equal(evaluateProof('biological_worker_receipts', { satisfied: true }).verdict, 'succeeded');
  assert.equal(evaluateProof('biological_worker_receipts', { satisfied: false }).verdict, 'partial');
  assert.equal(evaluateProof('biological_worker_receipts', undefined).verdict, 'partial');
}

function otherProofSourcesKeepTheirOwnValidation() {
  assert.equal(evaluateProof('worker_evidence_barrier', undefined).verdict, 'succeeded');
  assert.equal(evaluateProof('a_team_program', undefined).verdict, 'succeeded');
}

biologicalReceiptsRequireSatisfiedBudget();
otherProofSourcesKeepTheirOwnValidation();
console.log('Mission completion biological budget evidence: PASS');
