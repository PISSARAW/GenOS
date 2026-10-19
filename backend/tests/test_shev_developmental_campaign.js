'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { fingerprint } = require('../src/services/stateFingerprint');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const campaignService = require('../src/services/shev/developmentalLongitudinalCampaignService');

const HASH = (value) => fingerprint(value);
const LOCKS = { modelLock: 'model-sha256', toolsLock: 'tools-v3',
  permissionsHash: HASH('permissions'), initialSnapshotHash: HASH('initial-project') };
const BUDGET = { costUsd: 1, tokens: 1000, seconds: 60 };

function windows(prefix, count, painExpected) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`,
    taskHash: HASH(`${prefix}-task-${index}`), contextHash: HASH(`${prefix}-context-${index}`),
    dimension: 'planning', painExpected }));
}

function scheduleWindows(values, firstAt, stepMs) {
  values.forEach((window, index) => {
    window.scheduledAt = new Date(firstAt + index * stepMs).toISOString();
  });
}

function manifest(mode = 'protocol') {
  const trainingWindows = windows('train', 5, true);
  const heldoutWindows = windows('holdout', mode === 'field' ? 20 : 5, false);
  const startedAt = mode === 'field' ? '2026-01-01T00:00:00.000Z' : undefined;
  if (mode === 'field') {
    scheduleWindows(trainingWindows, Date.parse(startedAt) + 60 * 60 * 1000, 2 * 60 * 60 * 1000);
    scheduleWindows(heldoutWindows, Date.parse(startedAt) + 80 * 60 * 60 * 1000, 2 * 60 * 60 * 1000);
  }
  return campaignService.createManifest({ campaignId: `campaign-${mode}`,
    mode, coordinator: { organizationId: 'org', projectId: 'coordination', entityId: 'coordinator' },
    arms: { control: arm('control'), treatment: arm('treatment') },
    trainingWindows, heldoutWindows,
    startedAt,
    minimumDurationMs: mode === 'field' ? campaignService.FIELD_MINIMUM_MS : 0,
    thresholds: { minSuccessDelta: 0.1, maxPValue: 0.05, minPainEpisodes: 5,
      minConfirmedHeldout: 2 } });
}

function arm(name) {
  return { scope: { organizationId: 'org', projectId: `project-${name}`, entityId: `agent-${name}` },
    workspaceId: `workspace-${name}`, intervention: name === 'control' ? 'baseline' : 'full_arc',
    ...LOCKS, budget: BUDGET };
}

function pressureBefore(input) {
  if (input.arm !== 'treatment') return null;
  if (input.phase !== 'training') return 0.6;
  return input.window.id.endsWith('4') ? 0.3 : 0.1;
}

function pressureAfter(input, before) {
  if (input.arm !== 'treatment') return before;
  if (input.phase !== 'training') return 0.4;
  return Math.min(1, before + 0.1);
}

function outcomeFor(input) {
  const treatment = input.arm === 'treatment';
  const training = input.phase === 'training';
  const before = pressureBefore(input);
  const after = pressureAfter(input, before);
  return { success: treatment || training, projectId: input.project.projectId,
    actorId: `producer-${input.arm}`, regressions: 0,
    humanInterventions: treatment ? 0 : 1, costUsd: 0.1, tokens: 100,
    durationMs: 1000, painObserved: training,
    painObservationHash: training ? HASH(`pain:${input.arm}:${input.window.id}`) : null,
    developmentalPressureBefore: before, developmentalPressureAfter: after,
    progressResult: !training && treatment ? 'confirmed' : 'not_tested',
    clearanceApplied: !training && treatment,
    clearanceEvidenceHash: !training && treatment ? HASH(`clearance:${input.window.id}`) : null,
    contextHash: input.window.contextHash, artifactHash: HASH(`run:${input.arm}:${input.window.id}`) };
}

function verifierFor(input) {
  const outcome = input.outcome;
  const evidenceRefs = [outcome.artifactHash, outcome.painObservationHash,
    outcome.clearanceEvidenceHash].filter(Boolean);
  return { verified: true, verifierId: `independent-${input.arm}`,
    projectId: input.project.projectId, intervention: input.intervention,
    workspaceId: input.workspaceId, initialSnapshotHash: input.initialSnapshotHash,
    executionMode: input.mode, artifactHash: outcome.artifactHash,
    outcomeHash: fingerprint(outcome), conditionsHash: input.conditionsHash, evidenceRefs };
}

async function createDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  return db;
}

async function testPairedCampaignAndResume() {
  const db = await createDb();
  try {
    const calls = new Map();
    let attempts = 0;
    let failOnAttempt = 4;
    const runWindow = async (input) => {
      const key = `${input.arm}:${input.phase}:${input.window.id}`;
      calls.set(key, (calls.get(key) || 0) + 1);
      attempts += 1;
      if (attempts === failOnAttempt) throw new Error('simulated process interruption');
      return outcomeFor(input);
    };
    const input = { db, manifest: manifest(), runWindow, verifyWindow: async (record) => verifierFor(record) };
    await assert.rejects(campaignService.runCampaign(input), /simulated process interruption/);
    const savedBeforeResume = await require('../src/services/gvxDevelopmentLedger')
      .listAllEvents(db, input.manifest.arms.control.scope);
    assert.equal(savedBeforeResume.filter((event) => event.payload.kind === 'shev_developmental_run').length
      + (await require('../src/services/gvxDevelopmentLedger').listAllEvents(db,
        input.manifest.arms.treatment.scope)).filter((event) => event.payload.kind === 'shev_developmental_run').length, 3);
    failOnAttempt = -1;
    const report = await campaignService.runCampaign(input);
    assert.equal(report.status, 'protocol_only');
    assert.equal(report.benchmarkQualified, false);
    assert.equal(report.paired.pValue, 0.03125);
    assert.equal(report.developmental.pressureClearances, 5);
    assert.equal(report.promotionEligible, false);
    assert.equal(calls.size, 20);
    assert.equal([...calls.values()].filter((count) => count === 2).length, 1);
    const replay = await campaignService.runCampaign(input);
    assert.deepEqual(replay, report);
    assert.equal(calls.size, 20);
  } finally { await db.close(); }
}

async function testFieldRunnerWaitsForScheduledWindows() {
  const db = await createDb();
  try {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const trainingWindows = windows('field-train', 5, true);
    const heldoutWindows = windows('field-holdout', 20, false);
    const firstTraining = Date.now() + 60_000;
    scheduleWindows(trainingWindows, firstTraining, 2 * 60 * 60 * 1000);
    scheduleWindows(heldoutWindows, firstTraining + 14 * 60 * 60 * 1000, 4 * 60 * 60 * 1000);
    const fieldManifest = campaignService.createManifest({ campaignId: 'scheduled-field', mode: 'field',
      startedAt, minimumDurationMs: campaignService.FIELD_MINIMUM_MS,
      coordinator: { organizationId: 'org', projectId: 'coord-field', entityId: 'coord' },
      arms: { control: arm('control'), treatment: arm('treatment') },
      trainingWindows, heldoutWindows, thresholds: { minPainEpisodes: 5 } });
    let calls = 0;
    const report = await campaignService.runCampaign({ db, manifest: fieldManifest,
      now: Date.now() + 100 * 24 * 60 * 60 * 1000,
      runWindow: async () => { calls += 1; return {}; }, verifyWindow: async () => ({}) });
    assert.equal(calls, 0);
    assert.equal(report.status, 'in_progress');
    assert.equal(report.durationMet, false);
    assert.equal(report.benchmarkQualified, false);
  } finally { await db.close(); }
}

async function testFieldModeRequiresTimeAndSealedHoldouts() {
  assert.throws(() => campaignService.createManifest({ ...manifest('field'),
    minimumDurationMs: 1000 }), { code: 'SHEV_CAMPAIGN_DURATION_INVALID' });
  const leaked = { ...manifest(), heldoutWindows: windows('holdout', 5, false) };
  leaked.heldoutWindows[0].taskHash = leaked.trainingWindows[0].taskHash;
  delete leaked.manifestHash;
  assert.throws(() => campaignService.createManifest(leaked),
    { code: 'SHEV_CAMPAIGN_HOLDOUT_LEAKAGE' });
}

async function testVerifierCannotVerifyItsProducer() {
  const db = await createDb();
  try {
    const input = { db, manifest: manifest(), runWindow: async (args) => outcomeFor(args),
      verifyWindow: async (record) => ({ ...verifierFor(record), verifierId: record.outcome.actorId }) };
    await assert.rejects(campaignService.runCampaign(input),
      { code: 'SHEV_CAMPAIGN_VERIFICATION_INVALID' });
    const events = await require('../src/services/gvxDevelopmentLedger').listAllEvents(db,
      input.manifest.coordinator);
    assert.equal(events.filter((event) => event.payload.kind === 'shev_developmental_run').length, 0);
  } finally { await db.close(); }
}

async function main() {
  await testPairedCampaignAndResume();
  await testFieldRunnerWaitsForScheduledWindows();
  await testFieldModeRequiresTimeAndSealedHoldouts();
  await testVerifierCannotVerifyItsProducer();
  console.log('SHEV developmental longitudinal campaign checks passed (protocol-only; no field claim).');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
