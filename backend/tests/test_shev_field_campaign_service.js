'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { fingerprint } = require('../src/services/stateFingerprint');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const contract = require('../src/services/shev/developmentalCampaignContract');
const field = require('../src/services/shev/developmentalFieldCampaignService');
const adapterContract = require('../src/services/shev/developmentalFieldCampaignAdapter');

const HASH = (value) => fingerprint(value);
const LOCKS = { modelLock: { provider: 'local', digest: HASH('model') },
  toolsLock: { catalogDigest: HASH('tools') }, permissionsHash: HASH('permissions'),
  initialSnapshotHash: HASH('snapshot') };
const BUDGET = { costUsd: 1, tokens: 1000, seconds: 60 };
const CAMPAIGN_BUDGET = { costUsd: 10, tokens: 5000, seconds: 1000 };
const RUNTIME_LOCK = { digest: HASH('runtime'), evidenceHash: HASH('runtime-evidence') };
const ENVIRONMENT_LOCK = { digest: HASH('environment'), evidenceHash: HASH('environment-evidence') };

function arm(name) {
  return { scope: { organizationId: 'org', projectId: `project-${name}`,
    entityId: `agent-${name}` }, workspaceId: `workspace-${name}`,
  intervention: name === 'control' ? 'baseline' : 'full_arc', ...LOCKS, budget: BUDGET,
  campaignBudget: CAMPAIGN_BUDGET, runtimeLock: RUNTIME_LOCK,
  environmentLock: ENVIRONMENT_LOCK, interventionAttestation: {
    shevEnabled: name === 'treatment', evidenceHash: HASH(`intervention:${name}`) } };
}

function windows(options) {
  return Array.from({ length: options.count }, (_, index) => ({ id: `${options.prefix}-${index}`,
    taskHash: HASH(`${options.prefix}:task:${index}`),
    contextHash: HASH(`${options.prefix}:context:${index}`),
    dimension: 'planning', painExpected: options.painExpected,
    scheduledAt: new Date(options.firstAt + index * options.stepMs).toISOString() }));
}

function manifest(firstAt = Date.now() + 150) {
  const step = 60 * 60 * 1000;
  const startedAt = new Date(Date.now() - 1000).toISOString();
  return contract.createManifest({ campaignId: 'field-adapter-test', mode: 'field', startedAt,
    coordinator: { organizationId: 'org', projectId: 'coord', entityId: 'coordinator' },
    arms: { control: arm('control'), treatment: arm('treatment') },
    trainingWindows: windows({ prefix: 'train', count: 5, painExpected: true, firstAt, stepMs: step }),
    heldoutWindows: windows({ prefix: 'heldout', count: 20, painExpected: false,
      firstAt: firstAt + 80 * step, stepMs: step }),
    minimumDurationMs: contract.FIELD_MINIMUM_MS,
    thresholds: { minPainEpisodes: 5 } });
}

function workspaceAttestation(expected) {
  const body = { schema: adapterContract.WORKSPACE_SCHEMA, campaignId: expected.campaignId,
    manifestHash: expected.manifestHash, arm: expected.arm, projectId: expected.projectId,
    workspaceId: expected.workspaceId, isolatedFrom: expected.isolatedFrom,
    initialSnapshotHash: expected.initialSnapshotHash, modelLock: expected.modelLock,
    toolsLock: expected.toolsLock, permissionsHash: expected.permissionsHash,
    intervention: expected.intervention,
    ...(expected.campaignBudget && { campaignBudget: expected.campaignBudget }),
    ...(expected.runtimeLock && { runtimeLock: expected.runtimeLock }),
    ...(expected.environmentLock && { environmentLock: expected.environmentLock }),
    ...(expected.interventionAttestation
      && { interventionAttestation: expected.interventionAttestation }),
    attestorId: `workspace-attestor-${expected.arm}`,
    evidenceRefs: [HASH(`workspace:${expected.arm}`), expected.runtimeLock?.evidenceHash,
      expected.environmentLock?.evidenceHash,
      expected.interventionAttestation?.evidenceHash].filter(Boolean) };
  return { ...body, attestationHash: fingerprint(body) };
}

function outcomeFor(request, execution) {
  const treatment = request.arm === 'treatment';
  return { success: true, projectId: request.project.projectId, actorId: execution.actorId,
    regressions: 0, humanInterventions: treatment ? 0 : 1, costUsd: 0.1,
    durationMs: 100, tokens: 100, painObserved: true,
    painObservationHash: HASH(`pain:${execution.executionId}`),
    developmentalPressureBefore: treatment ? 0.1 : null,
    developmentalPressureAfter: treatment ? 0.2 : null, progressResult: 'not_tested',
    clearanceApplied: false, clearanceEvidenceHash: null,
    contextHash: request.window.contextHash, artifactHash: execution.artifactHash };
}

function measurementFor(request, execution) {
  const outcome = outcomeFor(request, execution);
  const body = { schema: adapterContract.MEASUREMENT_SCHEMA,
    executionId: execution.executionId, collectorId: `observer-${request.arm}`,
    measuredAt: new Date().toISOString(), outcome,
    evidenceRefs: [execution.artifactHash, outcome.painObservationHash] };
  return { ...body, measurementHash: fingerprint(body) };
}

function adapters(calls, override = {}) {
  return { workspace: { ensureArm: async (expected) => workspaceAttestation(expected) },
    runtime: { executeWindow: async ({ request }) => {
      calls.push(request.idempotencyKey);
      return { executionId: `execution-${request.arm}-${request.window.id}`,
        actorId: `producer-${request.arm}`, projectId: request.project.projectId,
        workspaceId: request.workspaceId, intervention: request.intervention,
        artifactHash: HASH(`artifact:${request.arm}:${request.window.id}`) };
    } }, observer: { measureWindow: async ({ request, execution }) =>
      measurementFor(request, execution) }, verifier: { verifyWindow: async (context) => {
        const { request, execution, measurement, outcome } = context;
        return { verified: true, verifierId: `verifier-${request.arm}`,
          executionId: execution.executionId, measurementHash: measurement.measurementHash,
          projectId: request.project.projectId, workspaceId: request.workspaceId,
          initialSnapshotHash: request.initialSnapshotHash, intervention: request.intervention,
          executionMode: request.mode, conditionsHash: request.conditionsHash,
          artifactHash: outcome.artifactHash, outcomeHash: fingerprint(outcome),
          interventionAttestation: request.interventionAttestation || null,
          evidenceRefs: [...measurement.evidenceRefs, measurement.measurementHash,
            request.runtimeLock?.evidenceHash, request.environmentLock?.evidenceHash,
            request.interventionAttestation?.evidenceHash].filter(Boolean) };
      } }, ...override };
}

async function createDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  return db;
}

async function testAttestedExecutionAndResume() {
  const db = await createDb();
  try {
    const sealed = manifest();
    const calls = [];
    const input = { db, manifest: sealed, adapters: adapters(calls) };
    const before = await field.runCampaign(input);
    assert.equal(before.status, 'in_progress');
    assert.equal(calls.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const after = await field.runCampaign(input);
    assert.equal(after.status, 'in_progress');
    assert.equal(calls.length, 2);
    await field.runCampaign(input);
    assert.equal(calls.length, 2);
  } finally { await db.close(); }
}

async function testFailsClosedOnWorkspaceMismatch() {
  const sealed = manifest(Date.now() + 60_000);
  const calls = [];
  const bad = adapters(calls);
  bad.workspace.ensureArm = async (expected) => ({ ...workspaceAttestation(expected),
    intervention: 'full_arc' });
  await assert.rejects(field.prepareCampaign({ manifest: sealed, adapters: bad }),
    { code: 'SHEV_FIELD_WORKSPACE_UNVERIFIED' });
  assert.equal(calls.length, 0);
}

async function testFailsClosedOnUnboundMeasurement() {
  const sealed = manifest(Date.now() + 60_000);
  const calls = [];
  const configured = adapters(calls);
  configured.observer.measureWindow = async ({ request, execution }) => ({
    ...measurementFor(request, execution), collectorId: execution.actorId });
  const request = { campaignId: sealed.campaignId, manifestHash: sealed.manifestHash,
    phase: 'training', mode: 'field', window: sealed.trainingWindows[0], arm: 'control',
    project: sealed.arms.control.scope, workspaceId: sealed.arms.control.workspaceId,
    intervention: 'baseline', conditionsHash: contract.conditionsHash(sealed.arms.control),
    initialSnapshotHash: sealed.arms.control.initialSnapshotHash,
    idempotencyKey: 'manual-window' };
  const direct = adapterContract.createFieldAdapter({ manifest: sealed, adapters: configured });
  await direct.prepare();
  await assert.rejects(direct.runWindow(request), { code: 'SHEV_FIELD_MEASUREMENT_UNVERIFIED' });
}

async function main() {
  await testAttestedExecutionAndResume();
  await testFailsClosedOnWorkspaceMismatch();
  await testFailsClosedOnUnboundMeasurement();
  console.log('SHEV paired field campaign adapter checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
