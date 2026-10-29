'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const profiles = require('../src/services/gvxTrialRuntimeProfile');
const nursery = require('../src/services/gvxExperimentalNursery');
const ledger = require('../src/services/gvxDevelopmentLedger');

const SECRET = 'test-only-gvx-runtime-authority-secret';
process.env.GENOS_GVX_TRIAL_PROFILE_SECRET = SECRET;
const scope = { organizationId: 'org-test', projectId: 'project-test', entityId: 'agent-test' };

function profile(armId) {
  const modes = profiles.ARMS[armId];
  return profiles.seal({ schema: profiles.VERSION, campaignId: 'campaign-test', trialId: `trial-${armId}`,
    armId, scenarioId: 'scenario-test', seed: 17, workspaceSnapshotHash: 'e'.repeat(64),
    scope, missionId: 'mission-test', codeRevision: 'a'.repeat(40),
    acquisition: modes[0], evolution: modes[1], learnerFacingVerification: modes[2], transmission: modes[3],
    modelProvider: 'provider', modelId: 'model-v1', toolsetHash: 'b'.repeat(64), manifestHash: 'c'.repeat(64),
    phaseBudgets: { acquisition: 1, evolution: 1, verification: 1, transmission: 1 },
    externalEvaluator: { required: true, capabilityId: 'isolated-evaluator-v1' }, authorityId: 'control-plane-test' }, SECRET);
}

function contextFor(armId) {
  const sealed = profile(armId);
  return { schema: 'genos.gvx.runtime-arm-context/v1', profile: sealed, profileHash: sealed.profileHash };
}

function missionFor(armId) {
  return { campaignId: 'campaign-test', trialId: `trial-${armId}`, armId, scenarioId: 'scenario-test', seed: 17,
    workspaceSnapshotHash: 'e'.repeat(64), missionId: 'mission-test',
    codeRevision: 'a'.repeat(40), scope, gvxTrialContext: contextFor(armId) };
}

async function gateChecks() {
  const acquisition = require('../src/services/developmentalBridge/agowToGvxSignalAdapter');
  const evolution = require('../src/services/gvxMutationProposer');
  const verification = require('../src/services/gvxAssessmentVerification');
  const transfer = require('../src/services/gvxTransferLifecycle');
  await assert.rejects(acquisition.recordAgowSignal(null, { gvxTrialContext: contextFor('A') }),
    { code: 'GVX_TRIAL_ACQUISITION_DISABLED' });
  await assert.rejects(evolution.propose({ gvxTrialContext: contextFor('E') }),
    { code: 'GVX_TRIAL_EVOLUTION_DISABLED' });
  await assert.rejects(verification.verifyAssessment({ gvxTrialContext: contextFor('F') }),
    { code: 'GVX_TRIAL_LEARNERFACINGVERIFICATION_DISABLED' });
  await assert.rejects(require('../src/services/gvxCycleExecution').execute({
    input: {}, signal: { gvxTrialContext: contextFor('F') } }),
  { code: 'GVX_TRIAL_LEARNERFACINGVERIFICATION_DISABLED' });
  await assert.rejects(transfer.startTransfer(null, { gvxTrialContext: contextFor('G') }),
    { code: 'GVX_TRIAL_TRANSMISSION_DISABLED' });
  await assert.rejects(transfer.startTransfer(null, { gvxTrialContext: contextFor('C'), scope, entityId: scope.entityId }),
    { code: 'GVX_TRANSFER_INVALID' });
  await assert.rejects(transfer.startTransfer(null, {}), { code: 'GVX_TRANSFER_INVALID' });
  assert.equal(profiles.assertMode(null, 'acquisition'), true);
  for (const dimension of profiles.DIMENSIONS) assert.equal(profiles.assertMode(contextFor('C'), dimension), true);
  await assert.rejects(acquisition.recordAgowSignal(null, {}), { code: 'DEVELOPMENTAL_SIGNAL_INVALID' });
  await assert.rejects(evolution.propose({}), /mutation-proposal-controls-required/);
}

async function admissionFailsClosed() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    let launched = false;
    await assert.rejects(nursery.run({ db, trialMission: missionFor('C'),
      createIsolatedWorld: async () => ({}), runWorld: async () => { launched = true; },
      artifactReader: async () => Buffer.alloc(0), verifierRegistry: {} }),
    { code: 'GVX_EXTERNAL_EVALUATOR_ISOLATION_UNAVAILABLE' });
    assert.equal(launched, false);
    const event = await ledger.getEvent(db, `gvx-trial-admission:${missionFor('C').gvxTrialContext.profileHash}`, scope);
    assert.equal(event.payload.executable, false);
    assert.equal(event.payload.reason, 'GVX_EXTERNAL_EVALUATOR_ISOLATION_UNAVAILABLE');
    const unprofiledMarkers = [{ trialId: 'trial-only' }, { armId: 'arm-only' },
      { scenarioId: 'scenario-only' }, { seed: 0 }, { workspaceSnapshotHash: 'e'.repeat(64) },
      { trialProtocol: profiles.VERSION }, { trialProtocol: 'unknown-version' },
      { gvxTrialCampaign: true }, { profileHash: 'f'.repeat(64) }];
    for (const marker of unprofiledMarkers) {
      let markerLaunched = false;
      await assert.rejects(nursery.run({ db, input: marker,
        createIsolatedWorld: async () => ({}), runWorld: async () => { markerLaunched = true; },
        artifactReader: async () => Buffer.alloc(0) }), { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
      assert.equal(markerLaunched, false);
    }
    let directWorldCreated = false;
    await assert.rejects(nursery.buildWorld({ db, scenarioId: 'scenario-only',
      plan: { snapshotHash: 'e'.repeat(64), worldBudget: 1 },
      createIsolatedWorld: async () => { directWorldCreated = true; } }, { armId: 'C', budget: 1 }),
    { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
    assert.equal(directWorldCreated, false);
    let directRunLaunched = false;
    await assert.rejects(nursery.runArm({ db, trialMission: missionFor('C'),
      input: { scope, entityId: scope.entityId, candidateHash: 'd'.repeat(64) },
      plan: { experimentId: 'direct-profile-run', snapshotHash: 'e'.repeat(64), worldBudget: 1, controls: {} },
      runWorld: async () => { directRunLaunched = true; } }, { armId: 'C', budget: 1 }),
    { code: 'GVX_EXTERNAL_EVALUATOR_ISOLATION_UNAVAILABLE' });
    assert.equal(directRunLaunched, false);
    let worldCreated = false;
    await assert.rejects(nursery.buildWorld({ db, trialMission: missionFor('C'),
      plan: { snapshotHash: 'e'.repeat(64), worldBudget: 1 },
      createIsolatedWorld: async () => { worldCreated = true; } }, { armId: 'C', budget: 1 }),
    { code: 'GVX_EXTERNAL_EVALUATOR_ISOLATION_UNAVAILABLE' });
    assert.equal(worldCreated, false);
    const transfer = require('../src/services/gvxTransferLifecycle');
    const started = await transfer.startTransfer(db, { scope: { organizationId: scope.organizationId,
      projectId: scope.projectId }, entityId: scope.entityId, sourceLineage: 'source-lineage',
      contextHash: 'd'.repeat(64), plasmid: { id: 'plasmid', capability: 'analyze', code: 'safe',
        requiredTools: [], requiredAuthority: 'execute' }, recipient: { id: scope.entityId, phenotype: 'generalist',
        capabilities: ['analyze'], authorityProfile: { execute: true }, immuneStatus: 'healthy', toolLease: [] },
      gvxTrialContext: contextFor('C') });
    await assert.rejects(transfer.advanceTransfer(db, { organizationId: scope.organizationId,
      projectId: scope.projectId, entityId: scope.entityId, transferId: started.payload.transfer.transferId,
      state: 'trial' }), { code: 'GVX_TRANSFER_PROFILE_MISMATCH' });
  } finally { await db.close(); }
}

async function executionContractChecks() {
  const trialContext = contextFor('C');
  const arm = { armId: 'C', budget: 1 };
  const options = { gvxTrialContext: trialContext, profileHash: trialContext.profileHash,
    plan: { snapshotHash: 'e'.repeat(64), worldBudget: 1 } };
  const { executeTrial } = nursery.trialRuntimeContext(options, arm);
  assert.deepEqual(executeTrial, { schema: 'genos.gvx.execute-trial/v1', scenarioId: 'scenario-test',
    seed: 17, armId: 'C', profileHash: trialContext.profileHash,
    workspaceSnapshotHash: 'e'.repeat(64), budget: 1 });
  for (const divergent of [
    { ...options, plan: { ...options.plan, snapshotHash: 'f'.repeat(64) } },
    { ...options, plan: { ...options.plan, worldBudget: 2 } }
  ]) assert.throws(() => nursery.trialRuntimeContext(divergent, arm),
    { code: 'GVX_TRIAL_EXECUTION_BINDING_MISMATCH' });
  assert.throws(() => nursery.trialRuntimeContext(options, { ...arm, armId: 'D' }),
    { code: 'GVX_TRIAL_EXECUTION_BINDING_MISMATCH' });
  assert.throws(() => nursery.trialRuntimeContext(options, { ...arm, scenarioId: '' }),
    { code: 'GVX_TRIAL_EXECUTION_BINDING_MISMATCH' });
  assert.throws(() => nursery.trialRuntimeContext(options, { ...arm, seed: 18 }),
    { code: 'GVX_TRIAL_EXECUTION_BINDING_MISMATCH' });
  assert.throws(() => nursery.trialRuntimeContext(options),
    { code: 'GVX_TRIAL_EXECUTION_BINDING_MISMATCH' });
  assert.throws(() => nursery.assertCachedExecution({ payload: { executeTrial } },
    { ...executeTrial, seed: 18 }), { code: 'GVX_NURSERY_CACHED_EXECUTION_MISMATCH' });
  assert.doesNotThrow(() => nursery.assertCachedExecution({ payload: { executeTrial } }, executeTrial));
  assert.deepEqual(nursery.trialRuntimeContext({ plan: options.plan }, arm),
    { gvxTrialContext: null, profileHash: null });
  assert.throws(() => nursery.trialRuntimeContext({ gvxTrialContext: trialContext, profileHash: 'f'.repeat(64) }),
    { code: 'GVX_TRIAL_CONTEXT_HASH_MISMATCH' });
}

async function profileAndMissionChecks() {
  for (const armId of Object.keys(profiles.ARMS)) {
    const sealed = profile(armId);
    assert.equal(profiles.verify(sealed, SECRET), true);
    assert.equal(profiles.seal({ ...sealed, profileHash: undefined, authoritySignature: undefined }, SECRET).profileHash, sealed.profileHash);
    assert.equal(Object.isFrozen(sealed.scope), true);
    assert.equal(profiles.bindMission(missionFor(armId), SECRET).profileHash, sealed.profileHash);
  }
  const changed = { ...contextFor('C'), profileHash: 'd'.repeat(64) };
  assert.throws(() => profiles.bindMission({ ...missionFor('C'), gvxTrialContext: changed }, SECRET),
    { code: 'GVX_TRIAL_CONTEXT_HASH_MISMATCH' });
  assert.throws(() => profiles.bindMission({ ...missionFor('C'), trialId: 'other' }, SECRET),
    { code: 'GVX_TRIAL_MISSION_BINDING_INVALID' });
  for (const marker of [{ scenarioId: 'scenario-only' }, { seed: 0 }, { workspaceSnapshotHash: 'e'.repeat(64) }]) {
    assert.throws(() => require('../src/services/gvxTrialMissionBinding').bindCampaignMission(marker),
      { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
  }
  assert.throws(() => require('../src/services/gvxTrialMissionBinding').bindCampaignMission({ trialProtocol: 'unknown-version' }),
    { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
  assert.throws(() => require('../src/services/gvxTrialMissionBinding').bindCampaignMission({
    ...missionFor('C'), trialProtocol: 'unknown-version' }), { code: 'GVX_TRIAL_MISSION_BINDING_INVALID' });
  assert.throws(() => require('../src/services/gvxTrialMissionBinding').bindCampaignMission({
    ...missionFor('C'), profileHash: 'f'.repeat(64) }), { code: 'GVX_TRIAL_CONTEXT_HASH_MISMATCH' });
  const extra = { ...profile('C'), unboundFlag: true };
  assert.throws(() => profiles.verify(extra, SECRET), { code: 'GVX_TRIAL_PROFILE_INVALID' });
  for (const invalidSeed of [-1, 4294967296, 1.5, '17']) {
    assert.throws(() => profiles.seal({ ...profile('C'), seed: invalidSeed,
      profileHash: undefined, authoritySignature: undefined }, SECRET), { code: 'GVX_TRIAL_PROFILE_INVALID' });
  }
  const changedSeed = profiles.seal({ ...profile('C'), seed: 18,
    profileHash: undefined, authoritySignature: undefined }, SECRET);
  assert.notEqual(changedSeed.profileHash, profile('C').profileHash);
  for (const [field, value] of [['scenarioId', 'different-scenario'], ['seed', 18],
    ['workspaceSnapshotHash', 'f'.repeat(64)]]) {
    assert.throws(() => profiles.bindMission({ ...missionFor('C'), [field]: value }, SECRET),
      { code: 'GVX_TRIAL_MISSION_BINDING_INVALID' });
  }
  assert.throws(() => profiles.bindContext({ ...contextFor('C'), schema: 'wrong' }, SECRET),
    { code: 'GVX_TRIAL_CONTEXT_SCHEMA_INVALID' });
  const ordinary = { missionId: 'ordinary-task' };
  assert.equal(require('../src/services/gvxTrialMissionBinding').bindCampaignMission(ordinary), ordinary);
  const missionBinding = require('../src/services/gvxTrialMissionBinding');
  const missionExecution = require('../src/services/agentRuntimeAdapter/missionExecution');
  for (const field of ['campaignId', 'trialId', 'armId']) {
    const partialMission = { [field]: `${field}-only` };
    assert.throws(() => missionBinding.bindCampaignMission(partialMission),
      { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
    await assert.rejects(missionExecution.startMissionInternal(partialMission),
      { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
  }
  assert.throws(() => require('../src/services/gvxTrialMissionBinding').bindCampaignMission({ gvxTrialCampaign: true }),
    { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
  const workerContract = require('../src/services/agents/workerKindService').buildWorkerContract('bounded_worker', {
    prompt: 'scoped task', scope: 'workspace', gvxTrialContext: contextFor('C') });
  assert.equal(workerContract.mission.gvxTrialContext.profileHash, contextFor('C').profileHash);
  assert.equal(workerContract.mission.scenarioId, 'scenario-test');
  assert.equal(workerContract.mission.seed, 17);
  assert.equal(workerContract.mission.workspaceSnapshotHash, 'e'.repeat(64));
  require('../src/services/agents/workerContractEnforcement').assertRuntimeContract(workerContract, 'bounded_worker');
  for (const [field, value] of [['scenarioId', 'different-scenario'], ['seed', 18],
    ['workspaceSnapshotHash', 'f'.repeat(64)]]) {
    const divergentWorker = structuredClone(workerContract);
    divergentWorker.mission[field] = value;
    assert.throws(() => require('../src/services/agents/workerContractEnforcement')
      .assertRuntimeContract(divergentWorker, 'bounded_worker'), { code: 'INVALID_WORKER_CONTRACT' });
  }
  assert.throws(() => require('../src/services/gvxTrialMissionBinding').assertWorkerContract({
    workerContract: { mission: { ...workerContract.mission, seed: 18 } } }, missionFor('C')),
  { code: 'GVX_TRIAL_WORKER_CONTEXT_MISMATCH' });
  const stripped = structuredClone(workerContract);
  delete stripped.mission.gvxTrialContext;
  assert.throws(() => require('../src/services/agents/workerContractEnforcement')
    .assertRuntimeContract(stripped, 'bounded_worker'), { code: 'INVALID_WORKER_CONTRACT' });
  const markerOnly = structuredClone(workerContract);
  markerOnly.mission = { scenarioId: 'scenario-test' };
  assert.throws(() => require('../src/services/agents/workerContractEnforcement')
    .assertRuntimeContract(markerOnly, 'bounded_worker'), { code: 'INVALID_WORKER_CONTRACT' });
  const recovery = require('../src/services/agentRecovery/dispatchWorkerRecovery').buildRecoveryMission({
    mission: { ...missionFor('C'), prompt: 'recover task' }, sourceAgentId: 'worker-a',
    target: { targetId: 'worker-b', name: 'Worker B', role: 'bounded_worker', prompt: 'recover task' },
    workspace: { workspaceRoot: 'root', workspaceId: 'workspace' }, bisectionResult: null,
    report: { mission: 'task', attempt: 0, maxAttempts: 2, category: 'timeout' },
    orchestratorId: 'orchestrator', decision: { action: 'replace_worker' }, nextVariant: 1 });
  assert.equal(recovery.gvxTrialContext.profileHash, missionFor('C').gvxTrialContext.profileHash);
  assert.equal(recovery.scenarioId, missionFor('C').scenarioId);
  assert.equal(recovery.seed, missionFor('C').seed);
  assert.equal(recovery.workspaceSnapshotHash, missionFor('C').workspaceSnapshotHash);
  const continuation = require('../src/services/agentContinuationQueueService').continuationTrialContext(
    { normalizedMission: missionFor('C') }, {});
  assert.equal(continuation.gvxTrialContext.profileHash, missionFor('C').gvxTrialContext.profileHash);
  assert.equal(continuation.scenarioId, missionFor('C').scenarioId);
  assert.equal(continuation.seed, missionFor('C').seed);
  assert.equal(continuation.workspaceSnapshotHash, missionFor('C').workspaceSnapshotHash);
}

async function main() {
  await profileAndMissionChecks();
  await executionContractChecks();
  await gateChecks();
  await admissionFailsClosed();
  console.log('GVX trial runtime profile gates and closed admission checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
