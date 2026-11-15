'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { digest } = require('../src/services/evidenceContractService');
const receiptProof = require('../src/services/biocenose/verification/hybridOracleReceiptProof');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');

function candidates() {
  return ['generator', 'reviewer', 'verifier'].map((role, index) => ({
    memberId: `mission-${role}`, communityRole: role, provider: `provider-${index}`,
    expertise: ['logic'], verificationKinds: ['formal_proof']
  }));
}

function acceptedWorkers(members) {
  return members.map((member, index) => ({
    workerId: `worker-${index}`, executionRunId: `run-${index}`,
    role: member.role, status: 'completed', result: {
      status: 'completed', verified: true,
      answer: `Contribution verified from ${member.role}`,
      outcome: 'success', evidenceEventId: `event-${index}`
    }
  }));
}

function proofFor(member, missionId) {
  const content = { missionId, workerId: member.workerId,
    result: { status: 'completed', verified: true } };
  return { reference: digest(content), content };
}

function signedOracle({ claim, verifier, communityId, round }) {
  const receipt = { status: 'VERIFIED', receiptId: `oracle-${claim.claimId}`,
    claimId: claim.claimId, verifierId: verifier.memberId, communityId, round,
    evidenceRef: `proof:${claim.claimId}`, oracle: 'native-test' };
  return { ...receipt, epistemicReceipt: receipts.issueReceipt({
    resultId: receipt.receiptId,
    evidenceDigest: receiptProof.bindingDigest({ claim, receipt,
      session: { communityId, round } }),
    verifierDigest: trust.listVerifierDigests()[0], status: 'verified', independent: true
  }) };
}

function memberInvoker(observed) {
  return async (request) => {
    request.onProviderObserved({ memberId: request.member.memberId,
      provider: request.member.provider, model: 'fixture-model' });
    if (request.phase === 'SEALED_JUDGMENT') {
      observed.push(request.context.workerContribution);
      return { judgment: { position: 'true', confidence: 0.9,
        claims: [{ statement: '2 + 2 = 4', type: 'FACTUAL',
          verification: { kinds: ['formal_proof'] } }], assumptions: [],
        evidenceRefs: [], unknowns: [], abstentions: [], probabilities: [] } };
    }
    if (request.phase === 'REVIEW') return { summary: 'No objection.', arguments: [], dissent: [] };
    return { previousPosition: 'true', newPosition: 'true', changedClaims: [],
      reasonCodes: [], evidenceRefs: [] };
  };
}

function mockMissionBoundaries(t, missionId) {
  t.mock.method(require('../src/services/topology/biologicalMissionPersist.cjs'),
    'persistBiologicalMissionTick', async () => {});
  t.mock.method(require('../src/services/topology/parentEnsurer.cjs'), 'ensureParent',
    async () => ({ id: 'orchestrator', workspace_id: 'workspace' }));
  t.mock.method(require('../src/services/topology/nceEnrichmentBuilder.cjs'),
    'buildNCEEnrichments', async () => []);
  t.mock.method(require('../src/services/topology/dispatchCollector.cjs'),
    'dispatchAndCollectResults', async ({ members }) => acceptedWorkers(members));
  t.mock.method(require('../src/services/biologicalWorkerCompletionService'),
    'collectCompletedWorkerStatuses', async () => {});
  t.mock.method(require('../src/services/topology/workerResultReader.cjs'), 'readAll', async () => {});
  t.mock.method(require('../src/services/workerGarageService'), 'getDynamicCapacity', () => 4);
  t.mock.method(require('../src/services/missionCompletionEvidenceService'), 'collect', async (input) => {
    const evidenceProofs = input.members.map((member) => proofFor(member, missionId));
    return { evidenceProofs, members: input.members.map((member, index) => ({
      ...member, memberId: member.workerId, evidenceRefs: [evidenceProofs[index].reference]
    })) };
  });
}

test('mission dispatch runs Biocenose deliberation before evidence-gated closure', async (t) => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  t.after(() => db.close());
  const missionId = 'mission-biocenose-dispatch-round';
  mockMissionBoundaries(t, missionId);
  delete require.cache[require.resolve('../src/services/topology/biologicalDispatchHandler.cjs')];
  const { handleBiological } = require('../src/services/topology/biologicalDispatchHandler.cjs');
  const observed = [];
  const envelope = await handleBiological(db, {
    missionId, orchestratorId: 'orchestrator', task: 'Verify that 2 + 2 = 4 is true.',
    request: { mode: 'biocenose', mission: 'Verify that 2 + 2 = 4 is true.',
      population: { generators: 1, reviewers: 1, verifiers: 1 },
      memberCandidates: candidates() },
    biocenoseRuntimeDependencies: {
      memberInvoker: memberInvoker(observed),
      verificationExecutor: signedOracle,
      isTrustedReceipt: (receipt) => receipt.oracle === 'native-test'
    }
  });
  assert.equal(envelope.success, true);
  const output = envelope.result.biologicalMode;
  assert.equal(output.runtimeProgression.applied, true);
  assert.equal(output.runtimeProgression.deliberationStatus, 'COMPLETED');
  assert.equal(output.completionContract.verdict, 'succeeded');
  assert.equal(observed.length, 3);
  assert.ok(observed.every((item) => item?.executionRunId?.startsWith('run-')));
  const constitution = await db.get(`SELECT constitution_json FROM biocenose_constitutions
    WHERE community_id = ? ORDER BY version DESC LIMIT 1`, output.communityId);
  assert.equal(JSON.parse(constitution.constitution_json).variant, 'hybrid_oracle_community');
});
