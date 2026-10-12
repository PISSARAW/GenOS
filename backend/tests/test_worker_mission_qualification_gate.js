'use strict';

const assert = require('node:assert/strict');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const { ensureVerifier } = require('../src/services/verifierTrustRegistry');
const gate = require('../src/services/workerMissionQualificationGate');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'worker-mission-qualification-test-secret';

const verifierDigest = ensureVerifier('procedure_semantic').digest;
const evaluate = (input) => gate.evaluate(input, new Set());

function receipt(input, actor, strategy) {
  return issueReceipt({ resultId: input.resultId, evidenceDigest: input.evidenceDigest,
    verifierDigest, status: 'verified', independent: true,
    coveredObligations: [input.resultId],
    independenceDescriptor: { actorId: actor },
    executionEvidence: [{ subject: { runId: input.runId, workerId: input.workerId },
      postconditions: { strategy, status: 'verified' } }] });
}

function mission(runId, workerId) {
  const input = { runId, workerId, resultId: `${runId}:result`,
    runStatus: 'completed', terminalEvent: 'AGENT_COMPLETED',
    expectedResultDigest: 'sha256:correct', actualResultDigest: 'sha256:correct',
    evidenceDigest: 'sha256:evidence' };
  return { ...input, receipts: [receipt(input, 'oracle-a', 'direct'),
    receipt(input, 'oracle-b', 'alternate')] };
}

function test() {
  const seen = new Set();
  const child = mission('child-run', 'child-worker');
  assert.equal(gate.evaluate(child, seen).status, 'verified');
  assert.equal(gate.evaluate(child, seen).reason, 'receipt_replay_or_dependent_quorum');
  const falseResult = mission('false-run', 'false-worker');
  falseResult.actualResultDigest = 'sha256:wrong';
  assert.equal(evaluate(falseResult).reason, 'reference_result_mismatch');
  const forged = mission('forged-run', 'forged-worker');
  forged.receipts[0].signature = '0'.repeat(64);
  assert.equal(evaluate(forged).reason, 'receipt_invalid_or_wrong_owner');
  const parent = mission('parent-run', 'parent-worker');
  parent.receipts = child.receipts;
  assert.equal(evaluate(parent).reason, 'receipt_invalid_or_wrong_owner');
  const fabricatedTerminal = mission('false-terminal', 'worker');
  fabricatedTerminal.terminalEvent = 'EVIDENCE_REPORT';
  assert.equal(evaluate(fabricatedTerminal).reason, 'mission_binding_missing');
  const dependent = mission('dependent-run', 'dependent-worker');
  dependent.receipts[1] = receipt(dependent, 'oracle-a', 'alternate');
  assert.equal(evaluate(dependent).reason, 'receipt_replay_or_dependent_quorum');
  const incomplete = { ...mission('missing-run', 'missing-worker'), receipts: [] };
  assert.equal(evaluate(incomplete).status, 'inconclusive');
  assert.equal(evaluate({ declaredStatus: 'abstained' }).status, 'abstained');
  assert.equal(gate.evaluate(mission('no-registry', 'worker')).reason, 'nonce_registry_missing');
}

test();
process.stdout.write('worker mission qualification gate: ok\n');
