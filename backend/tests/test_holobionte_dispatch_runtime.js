'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { digest } = require('../src/services/evidenceContractService');
const admission = require('../src/services/holobionte/symbionts/symbiontAdmissionService');
const policy = require('../src/services/holobionte/runtime/capabilityExecutionPolicy');
const workerBridge = require('../src/services/holobionte/runtime/workerMissionAdapters');

function report(member, index) {
  const workerId = member.workerId;
  const verificationRefs = ['arithmetic-proof:worker-result', 'isolation-proof:mission-trial'];
  return { outcome: 'success', answer: `Verified contribution ${index}`,
    workerArtifact: { type: member.workerArtifact || 'holobionte_contribution',
      content: { sum: 6 }, provenance: {
        sourceRefs: index === 0 ? ['arithmetic-proof:execution'] : verificationRefs,
        resultHash: policy.resultHash({ sum: 6 }), workerId,
        usage: { tokens: 1 }, metrics: { contributionScore: 0.9,
          benefitScore: 0.9, evidenceQuality: 1, costScore: 0.1,
          riskScore: 0, contractCompliant: true, unsafeBehavior: false }
      } } };
}

function acceptedWorkers(members) {
  return members.map((member, index) => ({ ...member,
    workerId: `worker-${index}`, executionRunId: `run-${index}`,
    status: 'completed', result: { status: 'completed', verified: true,
      answer: `Contribution ${index}`, outcome: 'success', evidenceEventId: `event-${index}` } }));
}

function proofFor(member, missionId) {
  const content = { missionId, workerId: member.workerId,
    result: { status: 'completed', verified: true } };
  return { reference: digest(content), content };
}

function trialCapabilityExecutor(context) {
  const evidenceRef = 'isolation-proof:mission-trial';
  return { result: { sum: 6 }, contributionScore: 0.9, contractCompliant: true,
    resourcesConsumed: { tokens: 1 }, riskScore: 0, unsafeBehavior: false,
    isolationProof: { schema: admission.ISOLATION_PROOF_SCHEMA, status: 'VERIFIED',
      isolationId: 'mission-trial', mechanism: 'fixture-process-sandbox',
      adapterProofHash: context.adapterProvenance.proofHash,
      observedAt: '2026-11-15T00:00:00.000Z', evidenceRefs: [evidenceRef],
      boundaries: { process: 'ISOLATED', workspace: 'EPHEMERAL', network: 'DENIED' } } };
}

test('worker bridge refuses an independent receipt not bound to the executed result', async () => {
  const producer = { workerId: 'producer', executionRunId: 'run-producer',
    evidenceReport: report({ workerId: 'producer' }, 0) };
  const verifierReport = report({ workerId: 'verifier' }, 1);
  delete verifierReport.workerArtifact.provenance.resultHash;
  const adapters = workerBridge.missionAdapters({}, [producer,
    { workerId: 'verifier', evidenceReport: verifierReport }]);
  await assert.rejects(() => adapters.verifyCapability({ resultHash: policy.resultHash({ sum: 6 }) }),
    (error) => error.code === 'HOLOBIONT_WORKER_ADAPTER_REQUIRED');
});

function mockMissionBoundaries(t, missionId, state) {
  t.mock.method(require('../src/services/topology/biologicalMissionPersist.cjs'),
    'persistBiologicalMissionTick', async () => {});
  t.mock.method(require('../src/services/topology/parentEnsurer.cjs'), 'ensureParent',
    async () => ({ id: 'orchestrator', workspace_id: 'workspace' }));
  t.mock.method(require('../src/services/topology/nceEnrichmentBuilder.cjs'),
    'buildNCEEnrichments', async () => []);
  t.mock.method(require('../src/services/topology/dispatchCollector.cjs'),
    'dispatchAndCollectResults', async ({ members }) => {
      state.accepted = acceptedWorkers(members);
      return state.accepted;
    });
  t.mock.method(require('../src/services/biologicalWorkerCompletionService'),
    'collectCompletedWorkerStatuses', async () => {});
  const reader = require('../src/services/topology/workerResultReader.cjs');
  t.mock.method(reader, 'readAll', async () => {});
  t.mock.method(reader, 'readEvidence', async (_db, input) => ({ valid: true,
    receipt: { result: { status: 'completed', verified: true },
      evidence: { report: report(input.member,
        Number(input.member.workerId.split('-').at(-1))) } } }));
  t.mock.method(require('../src/services/workerGarageService'), 'getDynamicCapacity', () => 4);
  t.mock.method(require('../src/services/workerGarageService'), 'state', async () => ({ available: 4 }));
  t.mock.method(require('../src/services/missionCompletionEvidenceService'), 'collect', async (input) => {
    const evidenceProofs = input.members.map((member) => proofFor(member, missionId));
    return { evidenceProofs, members: input.members.map((member, index) => ({
      ...member, memberId: member.workerId, evidenceRefs: [evidenceProofs[index].reference]
    })) };
  });
}

test('mission dispatch drives the opened Holobionte host through its canonical runtime', async (t) => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  t.after(() => db.close());
  const missionId = 'mission-holobionte-dispatch-runtime';
  const state = {};
  mockMissionBoundaries(t, missionId, state);
  delete require.cache[require.resolve('../src/services/topology/biologicalDispatchHandler.cjs')];
  const { handleBiological } = require('../src/services/topology/biologicalDispatchHandler.cjs');
  const envelope = await handleBiological(db, { missionId, orchestratorId: 'orchestrator',
    task: 'Compute and verify 1 + 2 + 3.',
    request: { mode: 'holobionte', mission: 'Compute and verify 1 + 2 + 3.',
      activateOrganization: false,
      capability: 'arithmetic', execution_budget: { tokens: 20, latencyMs: 10000, maxSteps: 1 },
      allocation: { policy: { tokens: { basal: 1, preferred: 2, maximum: 5,
        burstAllowance: 0 } }, available: { tokens: 10 } } },
    holobionteRuntimeDependencies: { trialCapabilityExecutor } });
  const output = envelope.result.biologicalMode;
  assert.equal(envelope.success, true);
  assert.equal(output.runtimeProgression.applied, true);
  assert.equal(output.runtimeProgression.runtimeStatus, 'VERIFIED');
  assert.equal(output.runtimeProgression.sessionClosed, true);
  assert.equal(output.runtimeProgression.hostReused, true);
  assert.equal(output.completionContract.verdict, 'succeeded');
  const session = await db.get('SELECT session_json FROM holobiont_sessions WHERE holobiont_id = ?',
    output.holobiontId);
  assert.equal(JSON.parse(session.session_json).status, 'CLOSED');
  assert.equal(await db.get(`SELECT COUNT(*) AS count FROM holobiont_symbiosis_ledger
    WHERE holobiont_id = ?`, output.holobiontId).then((row) => row.count), 1);
});
