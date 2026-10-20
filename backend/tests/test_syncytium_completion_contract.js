'use strict';

const assert = require('node:assert/strict');
const contract = require('../src/services/missionCompletionContract');
const { digest } = require('../src/services/evidenceContractService');

function proof(missionId = 'mission-1', workerId = 'worker-1') {
  const content = { schema: 'genos.worker-biological-execution-receipt/v1',
    missionId, workerId, result: { status: 'completed', verified: true } };
  return { reference: digest(content), content };
}

function input(evidence) {
  return { missionId: 'mission-1', topology: 'syncytium', lifecycleState: 'completed',
    requiredMemberIds: ['worker-1'],
    members: [{ memberId: 'worker-1', status: 'completed', evidenceRefs: [evidence.reference] }],
    evidenceProofs: [evidence], topologyValidation: { status: 'verified', reasons: [] },
    barrierStatus: 'complete' };
}

const valid = proof();
assert.equal(contract.evaluate(input(valid)).verdict, 'succeeded');

const missing = input(valid);
missing.evidenceProofs = [];
assert.deepEqual(contract.evaluate(missing).reasons, ['required_member_evidence_invalid']);

const noWorkers = { ...input(valid), requiredMemberIds: [], members: [] };
assert.equal(contract.evaluate(noWorkers).verdict, 'partial');

const tampered = input(valid);
tampered.evidenceProofs = [{ ...valid, content: { ...valid.content, workerId: 'attacker' } }];
assert.equal(contract.evaluate(tampered).verdict, 'partial');

const foreign = proof('another-mission');
assert.equal(contract.evaluate(input(foreign)).verdict, 'partial');

const topologyFailure = input(valid);
topologyFailure.topologyValidation = { status: 'failed', reasons: ['FAILED_SHARED_INVARIANTS'] };
assert.equal(contract.evaluate(topologyFailure).verdict, 'failed');

const separated = input(valid);
separated.invariants = [{ id: 'syncytium-only', passed: false }];
separated.oracle = null;
assert.equal(contract.evaluate(separated).verdict, 'succeeded',
  'the common contract consumes only the topology validation result');

const absentBarrier = input(valid);
delete absentBarrier.barrierStatus;
assert.deepEqual(contract.evaluate(absentBarrier).reasons, ['worker_barrier_missing']);
assert.equal(contract.evaluate(absentBarrier).verdict, 'partial');

const unknownBarrier = { ...input(valid), barrierStatus: 'unknown' };
assert.deepEqual(contract.evaluate(unknownBarrier).reasons, ['worker_barrier_invalid']);
assert.equal(contract.evaluate(unknownBarrier).verdict, 'partial');

const partialBarrier = { ...input(valid), barrierStatus: 'partial' };
assert.deepEqual(contract.evaluate(partialBarrier).reasons, ['worker_barrier_partial']);
assert.equal(contract.evaluate(partialBarrier).verdict, 'partial');

const completeBarrier = { ...input(valid), barrierStatus: 'complete' };
assert.equal(contract.evaluate(completeBarrier).verdict, 'succeeded');

const failedWithMissingBarrier = { ...absentBarrier, lifecycleState: 'failed' };
assert.equal(contract.evaluate(failedWithMissingBarrier).verdict, 'failed');

assert.equal(contract.processOutcome({ ...input(valid), interrupted: true }).verdict, 'interrupted');
console.log('Common completion contract and durable proof binding: PASS');
