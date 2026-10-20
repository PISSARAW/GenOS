'use strict';

const { fingerprint } = require('../stateFingerprint');
const ledger = require('../gvxDevelopmentLedger');
const contract = require('./developmentalCampaignContract');
const assessment = require('./developmentalCampaignEvaluation');

function eventId(kind, key) {
  return `shev-dev-campaign:${kind}:${fingerprint(key).slice(0, 40)}`;
}

function assertAdapters(input) {
  if (!input?.db || typeof input.runWindow !== 'function'
      || typeof input.verifyWindow !== 'function') {
    throw contract.failure('SHEV_CAMPAIGN_ADAPTERS_REQUIRED', 'Database, real runtime runner, and independent verifier are required.');
  }
}

async function preregister(db, manifest) {
  const sealed = contract.verifyManifest(manifest);
  const id = eventId('manifest', sealed.campaignId);
  const prior = await ledger.getEvent(db, id, sealed.coordinator);
  if (!prior) validateFieldStart(sealed);
  await ledger.appendEvent(db, { ...sealed.coordinator, id, type: 'experiment_started',
    payload: { kind: 'shev_developmental_manifest', manifest: sealed,
      manifestHash: sealed.manifestHash, promotionEligible: false } });
  return sealed;
}

function validateFieldStart(manifest) {
  if (manifest.mode !== 'field') return;
  const now = Date.now();
  const start = Date.parse(manifest.startedAt);
  const firstWindow = Date.parse(manifest.trainingWindows[0].scheduledAt);
  if (start > now + 60000 || now - start > 5 * 60 * 1000 || firstWindow < now) {
    throw contract.failure('SHEV_CAMPAIGN_PREREGISTRATION_STALE',
      'Field campaign must be registered immediately before its first scheduled window.');
  }
}

async function existingRuns(db, manifest) {
  const result = { control: new Map(), treatment: new Map() };
  for (const armName of ['control', 'treatment']) {
    const arm = manifest.arms[armName];
    const events = await ledger.listAllEvents(db, arm.scope);
    for (const event of events.filter((item) => item.payload?.kind === 'shev_developmental_run'
      && item.payload.campaignId === manifest.campaignId)) {
      if (event.payload.manifestHash !== manifest.manifestHash || event.payload.arm !== armName) {
        throw contract.failure('SHEV_CAMPAIGN_JOURNAL_CONFLICT', 'Persisted run belongs to a different manifest or arm.');
      }
      const key = `${event.payload.phase}:${event.payload.windowId}`;
      if (result[armName].has(key)) throw contract.failure('SHEV_CAMPAIGN_JOURNAL_DUPLICATE', 'Run journal contains a duplicate window.');
      result[armName].set(key, event.payload);
    }
  }
  return result;
}

function runKey(options) {
  const { manifest, armName, phase, window } = options;
  return { campaignId: manifest.campaignId, arm: armName, phase, windowId: window.id };
}

function runOptions(options) {
  const { manifest, armName, phase, window } = options;
  const arm = manifest.arms[armName];
  return { campaignId: manifest.campaignId, manifestHash: manifest.manifestHash,
    phase, mode: manifest.mode, window, arm: armName, project: arm.scope, workspaceId: arm.workspaceId,
    intervention: arm.intervention, conditionsHash: contract.conditionsHash(arm),
    modelLock: arm.modelLock, toolsLock: arm.toolsLock, permissionsHash: arm.permissionsHash,
    initialSnapshotHash: arm.initialSnapshotHash,
    budget: arm.budget, campaignBudget: arm.campaignBudget,
    runtimeLock: arm.runtimeLock, environmentLock: arm.environmentLock,
    interventionAttestation: arm.interventionAttestation,
    idempotencyKey: eventId('run', runKey(options)),
    painExpected: window.painExpected, scheduledAt: window.scheduledAt };
}

function campaignUsage(journal, armName) {
  return [...journal[armName].values()].reduce((usage, record) => ({
    costUsd: usage.costUsd + record.outcome.costUsd,
    tokens: usage.tokens + record.outcome.tokens,
    durationMs: usage.durationMs + record.outcome.durationMs
  }), { costUsd: 0, tokens: 0, durationMs: 0 });
}

async function executeWindow(options) {
  const { input, journal, armName, phase, window } = options;
  const key = `${phase}:${window.id}`;
  if (journal[armName].has(key)) return journal[armName].get(key);
  const manifest = input.manifest;
  const windowOptions = runOptions({ manifest, armName, phase, window });
  const raw = await input.runWindow(windowOptions);
  const outcome = assessment.validateOutcome({ result: raw, phase, window,
    arm: manifest.arms[armName], campaignUsage: campaignUsage(journal, armName) });
  const receipt = await input.verifyWindow({ ...windowOptions, outcome });
  const verification = assessment.validateVerification({ receipt, outcome, manifest,
    arm: manifest.arms[armName] });
  const payload = { kind: 'shev_developmental_run', campaignId: manifest.campaignId,
    manifestHash: manifest.manifestHash, arm: armName, phase, windowId: window.id,
    outcome, verification, promotionEligible: false };
  await ledger.appendEvent(input.db, { ...manifest.arms[armName].scope,
    id: windowOptions.idempotencyKey, type: 'experiment_finished', payload });
  journal[armName].set(key, payload);
  return payload;
}

function randomizedOrders(manifest, phase, windows) {
  const ranked = [...windows].sort((left, right) => fingerprint([
    manifest.randomizationSeed, phase, left.id
  ]).localeCompare(fingerprint([manifest.randomizationSeed, phase, right.id])));
  return new Map(ranked.map((window, index) => [window.id,
    index % 2 ? ['treatment', 'control'] : ['control', 'treatment']]));
}

async function runPhase(options) {
  const { input, journal, phase, windows } = options;
  const now = Number(input.now) || Date.now();
  const orders = randomizedOrders(input.manifest, phase, windows);
  for (const window of windows) {
    if (window.scheduledAt && Date.parse(window.scheduledAt) > now) break;
    for (const arm of orders.get(window.id)) {
      await executeWindow({ input, journal, armName: arm, phase, window });
    }
  }
  return windows.every((window) => ['control', 'treatment'].every((arm) =>
    journal[arm].has(`${phase}:${window.id}`)));
}

function groupedRuns(journal, manifest) {
  const result = { control: { training: [], heldout: [] }, treatment: { training: [], heldout: [] } };
  for (const arm of ['control', 'treatment']) {
    for (const phase of ['training', 'heldout']) {
      const windows = phase === 'training' ? manifest.trainingWindows : manifest.heldoutWindows;
      result[arm][phase] = windows.map((window) => journal[arm].get(`${phase}:${window.id}`)?.outcome)
        .filter(Boolean);
    }
  }
  return result;
}

async function saveFinalReport(input, report) {
  if (['in_progress', 'awaiting_duration'].includes(report.status)) return;
  await ledger.appendEvent(input.db, { ...input.manifest.coordinator,
    id: eventId('report', input.manifest.campaignId), type: 'evidence_attached',
    payload: { kind: 'shev_developmental_campaign_report', report,
      promotionEligible: false } });
}

async function savedFinalReport(db, manifest) {
  const events = await ledger.listAllEvents(db, manifest.coordinator);
  const event = events.find((item) => item.payload?.kind === 'shev_developmental_campaign_report'
    && item.payload.report?.campaignId === manifest.campaignId);
  if (!event) return null;
  if (event.payload.report.manifestHash !== manifest.manifestHash) {
    throw contract.failure('SHEV_CAMPAIGN_REPORT_CONFLICT', 'Persisted report belongs to a different manifest.');
  }
  return event.payload.report;
}

async function runCampaign(input) {
  assertAdapters(input);
  const manifest = contract.verifyManifest(input.manifest);
  const now = manifest.mode === 'protocol' && Number.isFinite(input.now) ? input.now : Date.now();
  input = { ...input, manifest, now };
  await preregister(input.db, manifest);
  const final = await savedFinalReport(input.db, manifest);
  if (final) return final;
  const journal = await existingRuns(input.db, manifest);
  const trainingComplete = await runPhase({ input, journal, phase: 'training',
    windows: manifest.trainingWindows });
  if (trainingComplete) await runPhase({ input, journal, phase: 'heldout',
    windows: manifest.heldoutWindows });
  const report = assessment.evaluate(manifest, groupedRuns(journal, manifest), now);
  await saveFinalReport(input, report);
  return report;
}

module.exports = { runCampaign, preregister, existingRuns, runOptions, savedFinalReport };
