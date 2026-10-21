'use strict';

const assert = require('node:assert/strict');
const completion = require('../src/services/biologicalMissionCompletionService');
const { digest } = require('../src/services/evidenceContractService');
const { KNOWN_TOPOLOGIES, createRegistry } = require('../src/services/topologyCompletionAdapters');
const { handleBiologicalCondition } = require('../src/services/topology/biologicalConditions.cjs');

const SCOPE_REASONS = Object.freeze({
  biocenose: 'biocenose_scope_missing', trinity: 'trinity_scope_missing',
  a_team: 'ateam_scope_missing', biome: 'biome_completion_scope_missing',
  holobionte: 'holobionte_completion_scope_missing',
  metapopulation: 'metapopulation_completion_scope_missing',
  rhizome: 'rhizome_scope_missing', syncytium: 'SEMANTIC_VALIDATION_MISSING'
});

function output(statuses, status = 'completed') {
  return { status, members: statuses.map((memberStatus, index) => ({
    workerId: `worker-${index + 1}`, status: memberStatus
  })), dispatchFailures: [] };
}

function proof(missionId, workerId) {
  const suffix = digest({ missionId, workerId }).slice('sha256:'.length);
  const content = { missionId, workerId, result: { status: 'completed', verified: true },
    semanticVerification: { schema: 'genos.native-oracle-receipt-reference/v1',
      hash: suffix, acceptanceHash: digest({ missionId, workerId, accepted: true }),
      budgetAssessment: { satisfied: true } } };
  return { reference: digest(content), content };
}

async function verifyWorkerCompletionWithoutDecisionProof() {
  const result = await completion.complete({ mode: 'trinity', missionId: 'mission-1',
    output: output(['completed', 'completed']), expectedCount: 2 });
  assert.equal(result.complete, false);
  assert.equal(result.status, 'partial');
  assert.equal(result.semanticValidation, undefined);
  assert.equal(result.completionContract.verdict, 'partial');
  assert.equal(result.success, false);
  assert.equal(handleBiologicalCondition('trinity', { biologicalMode: result }), true);
}

async function verifyKnownModesFailClosed() {
  for (const mode of KNOWN_TOPOLOGIES) {
    const missionId = `mission-${mode}`;
    const result = await completion.complete({ mode, missionId, output: output(['completed']),
      expectedCount: 1, evidenceProofs: [proof(missionId, 'worker-1')] });
    assert.equal(result.complete, false, mode);
    assert.equal(result.completionContract.schema, 'genos.mission-completion/v1', mode);
    assert.equal(result.completionContract.verdict, 'partial', mode);
    const reason = SCOPE_REASONS[mode] || 'topology_completion_adapter_unavailable';
    assert.equal(result.completionContract.reasons.includes(reason), true, mode);
    if (mode === 'syncytium') {
      assert.equal(result.completionContract.promotionEligible, false, mode);
      continue;
    }
    assert.equal(result.completionContract.closureChecks.requiredWorkers, true, mode);
    assert.equal(result.completionContract.closureChecks.independentOracle, false, mode);
  }
}

async function verifyPartialBarrierFails() {
  const result = await completion.complete({ mode: 'rhizome', missionId: 'mission-3',
    output: output(['completed', 'error'], 'partial'), expectedCount: 2 });
  assert.equal(result.complete, false);
  assert.equal(result.status, 'failed');
  assert.equal(handleBiologicalCondition('rhizome', { biologicalMode: result }), true);
}

async function verifyRhizomeUsesCollectedBranches() {
  const evidenceProofs = [proof('mission-4', 'worker-1'), proof('mission-4', 'worker-2')];
  const result = await completion.complete({ mode: 'rhizome', missionId: 'mission-4',
    output: { status: 'completed', complete: true, dispatchFailures: [],
      members: [{ workerId: 'worker-1', status: 'completed' },
        { workerId: 'worker-2', status: 'started' }],
      branches: [{ workerId: 'worker-1', status: 'completed' },
        { workerId: 'worker-2', status: 'completed' }] },
    expectedCount: 1, evidenceProofs });
  assert.equal(result.complete, false);
  assert.equal(result.status, 'partial');
  assert.equal(result.completionContract.closureChecks.requiredWorkers, true);
  assert.equal(result.completionContract.closureChecks.evidence, true);
  assert.equal(handleBiologicalCondition('rhizome', { biologicalMode: result }), true);
}

function verifiedAdapter(topology) {
  return { id: `${topology}-test-adapter`, topology, specialized: true,
    async build({ context, evidence }) {
      const evidenceRefs = evidence.evidenceProofs.map((item) => item.reference);
      const receipt = { schema: 'test.topology-closure/v1', missionId: context.missionId,
        topology, verdict: 'verified' };
      return { missionId: context.missionId, topology, lifecycleState: 'completed',
        producerId: context.missionId, roster: { requiredMemberIds: evidence.members.map(
          (member) => member.workerId), members: evidence.members,
        evidenceProofs: evidence.evidenceProofs }, barrierStatus: 'complete',
      topologyValidation: { status: 'verified', reasons: [] },
      invariants: [{ id: `${topology}_canonical_state`, passed: true }],
      oracle: { status: 'verified', independent: true,
        verifierIds: [`${topology}-test-verifier`], evidenceRefs,
        receipt, receiptHash: digest(receipt) } };
    } };
}

async function verifySpecializedAdapterExtensionPoint() {
  const registry = createRegistry();
  registry.register('trinity', verifiedAdapter('trinity'));
  const missionId = 'mission-specialized-trinity';
  const result = await completion.complete({ mode: 'trinity', missionId,
    output: output(['completed']), expectedCount: 1,
    evidenceProofs: [proof(missionId, 'worker-1')], completionAdapterRegistry: registry });
  assert.equal(result.complete, true);
  assert.equal(result.completionContract.verdict, 'succeeded');
  assert.equal(result.completionContract.closureChecks.independentOracle, true);
}

async function verifyMalformedAdapterFailsClosed() {
  const registry = createRegistry({ biome: { async build() { return null; } } });
  const missionId = 'mission-malformed-biome-adapter';
  const result = await completion.complete({ mode: 'biome', missionId,
    output: output(['completed']), expectedCount: 1,
    evidenceProofs: [proof(missionId, 'worker-1')], completionAdapterRegistry: registry });
  assert.equal(result.complete, false);
  assert.equal(result.completionContract.verdict, 'partial');
  assert.equal(result.completionContract.reasons.includes('execution_state_unknown'), true);
}

async function main() {
  await verifyWorkerCompletionWithoutDecisionProof();
  await verifyKnownModesFailClosed();
  await verifyPartialBarrierFails();
  await verifyRhizomeUsesCollectedBranches();
  await verifySpecializedAdapterExtensionPoint();
  await verifyMalformedAdapterFailsClosed();
  console.log('Biological mission completion: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
