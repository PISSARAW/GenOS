'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceContractService');
const { closeMission } = require('../src/services/missionClosureService');
const completion = require('../src/services/biologicalMissionCompletionService');
const dossierAdapter = require('../src/services/missionClosureDossierAdapter');

function workerProof(missionId, workerId) {
  const oracleHash = digest({ missionId, workerId, oracle: true }).slice('sha256:'.length);
  const content = { missionId, workerId, result: { status: 'completed', verified: true },
    semanticVerification: { schema: 'genos.native-oracle-receipt-reference/v1',
      hash: oracleHash, acceptanceHash: digest({ oracleHash, accepted: true }),
      budgetAssessment: { satisfied: true } } };
  return { reference: digest(content), content };
}

function independentOracle(missionId, evidenceRefs) {
  const receipt = { schema: 'test.closure-oracle/v1', missionId, verdict: 'verified' };
  return { status: 'verified', independent: true, verifierIds: ['independent-test-oracle'],
    evidenceRefs, receipt, receiptHash: digest(receipt) };
}

function closureInput() {
  const missionId = 'mission-close';
  const proof = workerProof(missionId, 'worker-close');
  return { missionId, topology: 'test', lifecycleState: 'completed', producerId: 'orchestrator-close',
    requiredMemberIds: ['worker-close'],
    members: [{ memberId: 'worker-close', status: 'completed', evidenceRefs: [proof.reference] }],
    evidenceProofs: [proof], topologyValidation: { status: 'verified', reasons: [] },
    barrierStatus: 'complete', invariants: [{ id: 'result_valid', passed: true }],
    oracle: independentOracle(missionId, [proof.reference]) };
}

function verifyAllClosureGates() {
  const input = closureInput();
  const succeeded = closeMission(input);
  assert.equal(succeeded.verdict, 'succeeded');
  assert.deepEqual(succeeded.closureChecks, { requiredWorkers: true, invariants: true,
    independentOracle: true, evidence: true });
  assert.equal(closeMission({ ...input, evidenceProofs: [] }).verdict, 'partial');
  assert.equal(closeMission({ ...input, members: [{ ...input.members[0], status: 'running' }] }).verdict, 'partial');
  assert.equal(closeMission({ ...input, invariants: [{ id: 'result_valid', passed: false }] }).verdict, 'failed');
  assert.equal(closeMission({ ...input, oracle: null }).verdict, 'partial');
  assert.equal(closeMission({ ...input, oracle: { ...input.oracle,
    receipt: { ...input.oracle.receipt, verdict: 'tampered' } } }).verdict, 'partial');
  assert.equal(closeMission({ ...input, lifecycleState: 'accepted' }).verdict, 'in_progress');
}

async function verifyBiologicalTopologyPaths() {
  for (const mode of ['trinity', 'metapopulation']) {
    const missionId = `mission-${mode}`;
    const proof = workerProof(missionId, `worker-${mode}`);
    const output = { status: 'completed', members: [{ workerId: `worker-${mode}`, status: 'completed' }],
      dispatchFailures: [] };
    const result = await completion.complete({ mode, missionId, output, expectedCount: 1,
      evidenceProofs: [proof] });
    assert.equal(result.completionContract.verdict, 'partial', mode);
    assert.equal(result.completionContract.reasons.includes(
      'topology_completion_adapter_unavailable'), true, mode);
    assert.equal(result.completionContract.closureChecks.independentOracle, false, mode);
  }
}

function verifyWorkerBarrierAdapter() {
  const workers = [{ agentId: 'worker-barrier' }];
  const dossiers = [{ workerId: 'worker-barrier', events: [{ eventType: 'AGENT_COMPLETED',
    executionRunId: 'run-barrier', nativeOracleRef: { hash: 'oracle-hash', eventId: 'oracle-event' },
    evidenceReport: { outcome: 'success', claims: [{ statement: 'done', evidence: ['proof'] }] } }] }];
  const input = dossierAdapter.buildClosureInput({ missionId: 'mission-barrier', producerId: 'root',
    workers, dossiers, invariants: [{ id: 'dossiers_valid', passed: true }] });
  assert.equal(closeMission(input).verdict, 'succeeded');
  const missingOracle = dossierAdapter.buildClosureInput({ missionId: 'mission-barrier', producerId: 'root',
    workers, dossiers: [{ ...dossiers[0], events: [{ ...dossiers[0].events[0], nativeOracleRef: null }] }],
    invariants: [{ id: 'dossiers_valid', passed: true }] });
  assert.equal(closeMission(missingOracle).verdict, 'partial');
}

async function main() {
  verifyAllClosureGates();
  verifyWorkerBarrierAdapter();
  await verifyBiologicalTopologyPaths();
  console.log('Common mission closure barrier: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
