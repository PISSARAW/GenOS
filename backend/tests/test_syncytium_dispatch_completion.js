'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { digest } = require('../src/services/evidenceContractService');
const syncytium = require('../src/services/syncytiumCoordinationService');
const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');

function launchMission(variantPolicy) {
  return workerLaunchPayload({
    context: { task: 'Verify shared state', request: { mode: 'syncytium' },
      topologySession: { sessionId: 'session-1', revision: 2, variantPolicy } },
    member: { role: 'shared_state_coordinator', workerKind: 'liaison_worker',
      mission: 'Verify shared state' },
    workerId: 'worker-1', parent: {}, capabilities: [], toolLease: ['genos_topology_session']
  }).mission;
}

test('Syncytium launch instructions match generic and specialized runtimes', () => {
  const generic = launchMission({ runtimeMode: 'generic' });
  assert.match(generic, /operation "schema"/);
  assert.match(generic, /operation "apply"/);
  assert.match(generic, /MUST include at least one/);
  assert.doesNotMatch(generic, /use an empty array/);

  const specialized = launchMission({ runtimeMode: 'specialized' });
  assert.match(specialized, /operation "variant"/);
  assert.match(specialized, /Generic apply\/branch\/promote operations are disabled/);
  assert.doesNotMatch(specialized, /operation "apply"/);
});

test('Syncytium completion refuses a worker without a bound execution run', async () => {
  const context = { missionId: 'mission-missing-run', dispatchFailures: [] };
  const accepted = [{ workerId: 'worker-without-run', role: 'parallel_executor' }];
  await require('../src/services/biologicalWorkerCompletionService')
    .collectCompletedWorkerStatuses({ db: {}, context, accepted });
  assert.equal(accepted[0].status, 'missing_run');
  assert.deepEqual(context.dispatchFailures, [{ role: 'parallel_executor',
    reason: 'worker_status_missing_run' }]);
});

function acceptedWorkers(members) {
  return members.map((member, index) => ({ ...member,
    workerId: `worker-${index}`, executionRunId: `run-${index}`,
    status: 'started', result: { status: 'completed', verified: true,
      answer: `Verified contribution ${index}`, outcome: 'success', evidenceEventId: `event-${index}` } }));
}

function workerEvidence(member) {
  return { valid: true, receipt: { result: { status: 'completed', verified: true },
    evidence: { report: { outcome: 'success', answer: 'Shared result verified',
      semanticClaims: [{ subject: 'mission result', predicate: 'verified',
        value: true, evidence: [`receipt:${member.executionRunId}`] }] } } } };
}

function proofFor(member, missionId) {
  const content = { missionId, workerId: member.workerId,
    result: { status: 'completed', verified: true } };
  return { reference: digest(content), content };
}

function mockMissionBoundaries(t, missionId, state) {
  t.mock.method(require('../src/services/topology/biologicalMissionPersist.cjs'),
    'persistBiologicalMissionTick', async () => {});
  t.mock.method(require('../src/services/topology/parentEnsurer.cjs'), 'ensureParent',
    async () => ({ id: 'orchestrator', workspace_id: 'workspace' }));
  t.mock.method(require('../src/services/topology/nceEnrichmentBuilder.cjs'),
    'buildNCEEnrichments', async () => []);
  t.mock.method(require('../src/services/topology/dispatchCollector.cjs'),
    'dispatchAndCollectResults', async ({ db, context, members }) => {
      state.runtimeMode = context.topologySession.variantPolicy?.runtimeMode;
      state.accepted = acceptedWorkers(members);
      for (const [index, member] of state.accepted.entries()) {
        await syncytium.applyOperation(context.topologySession.sessionId, {
          opId: `contribution-${index}`, actorId: member.workerId,
          kind: { type: 'set_field', key: `contribution_${index}`, value: 'verified' }
        }, { db });
      }
      return state.accepted;
    });
  const reader = require('../src/services/topology/workerResultReader.cjs');
  t.mock.method(reader, 'read', async (_db, input) => {
    state.readRuns ||= [];
    state.readRuns.push(input.executionRunId);
    return { status: 'completed', verified: true };
  });
  t.mock.method(reader, 'readAll', async () => {});
  t.mock.method(reader, 'readEvidence', async (_db, input) => workerEvidence(input.member));
  t.mock.method(require('../src/services/missionCompletionEvidenceService'), 'collect', async (input) => {
    const evidenceProofs = input.members.map((member) => proofFor(member, missionId));
    return { evidenceProofs, members: input.members.map((member, index) => ({
      ...member, memberId: member.workerId, evidenceRefs: [evidenceProofs[index].reference]
    })) };
  });
}

test('handleBiological completes Syncytium from run-bound workers and shared contributions', async (t) => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  t.after(() => db.close());
  const missionId = 'mission-syncytium-dispatch-completion';
  const state = {};
  mockMissionBoundaries(t, missionId, state);
  delete require.cache[require.resolve('../src/services/topology/biologicalDispatchHandler.cjs')];
  const { handleBiological } = require('../src/services/topology/biologicalDispatchHandler.cjs');
  const fields = Object.fromEntries(Array.from({ length: 8 }, (_item, index) => [
    `contribution_${index}`, { dataType: 'LWW_REGISTER' }
  ]));
  const envelope = await handleBiological(db, { missionId, orchestratorId: 'orchestrator',
    task: 'Build and verify a shared result.', request: { mode: 'syncytium',
      mission: 'Build and verify a shared result.', activateOrganization: false,
      configuration: { useVariantRuntime: false, fields }, timeoutMs: 10000 } });

  assert.equal(envelope.success, true);
  const output = envelope.result.biologicalMode;
  assert.equal(output.completionContract.verdict, 'succeeded');
  assert.equal(output.semanticValidation.status, 'complete');
  assert.equal(output.stateValidation.status, 'verified');
  assert.equal(output.materialization.status, 'verified');
  assert.equal(state.runtimeMode, 'generic');
  assert.deepEqual(new Set(state.readRuns),
    new Set(state.accepted.map((member) => member.executionRunId)));
});
