'use strict';

const { fingerprint } = require('../stateFingerprint');

const SCHEMA = 'genos.shev-developmental-longitudinal-campaign/v1';
const HASH = /^[a-f0-9]{64}$/;
const FIELD_MINIMUM_MS = 72 * 60 * 60 * 1000;

function failure(code, detail) {
  return Object.assign(new Error(detail), { code });
}

function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw failure('SHEV_CAMPAIGN_MANIFEST_INVALID', `${name} is required.`);
  }
  return value.trim();
}

function validHash(value) { return typeof value === 'string' && HASH.test(value); }

function scope(value, name) {
  return { organizationId: text(value?.organizationId, `${name}.organizationId`),
    projectId: text(value?.projectId, `${name}.projectId`),
    entityId: text(value?.entityId, `${name}.entityId`) };
}

function normalizeArm(name, value) {
  const intervention = name === 'control' ? 'baseline' : 'full_arc';
  if (value?.intervention !== intervention || !validHash(value.initialSnapshotHash)
      || !validHash(value.permissionsHash)) {
    throw failure('SHEV_CAMPAIGN_ARMS_INVALID', `Arm ${name} has invalid intervention or snapshot locks.`);
  }
  if (!value.modelLock || !value.toolsLock || !value.budget) {
    throw failure('SHEV_CAMPAIGN_ARMS_INVALID', `Arm ${name} is missing matched runtime locks.`);
  }
  return { scope: scope(value.scope, `arms.${name}.scope`), workspaceId: text(value.workspaceId, `${name}.workspaceId`),
    intervention, initialSnapshotHash: value.initialSnapshotHash, modelLock: value.modelLock,
    toolsLock: value.toolsLock, permissionsHash: value.permissionsHash,
    budget: normalizeBudget(value.budget) };
}

function normalizeBudget(value) {
  const budget = { costUsd: Number(value.costUsd), tokens: Number(value.tokens), seconds: Number(value.seconds) };
  if (Object.values(budget).some((item) => !Number.isFinite(item) || item <= 0)) {
    throw failure('SHEV_CAMPAIGN_BUDGET_INVALID', 'Matched positive cost, token, and time budgets are required.');
  }
  return budget;
}

function normalizeWindow(value, painExpected) {
  if (!value || value.painExpected !== painExpected || !validHash(value.taskHash)
      || !validHash(value.contextHash)) {
    throw failure('SHEV_CAMPAIGN_WINDOW_INVALID', 'Training and held-out windows need sealed, disjoint task/context hashes.');
  }
  return { id: text(value.id, 'window.id'), taskHash: value.taskHash,
    contextHash: value.contextHash, dimension: text(value.dimension, 'window.dimension'),
    painExpected, scheduledAt: value.scheduledAt || null };
}

function validateWindowCount(values, minimum, phase) {
  if (!Array.isArray(values) || values.length < minimum || values.length > 100) {
    throw failure('SHEV_CAMPAIGN_WINDOWS_INVALID', `${phase} requires ${minimum} to 100 windows.`);
  }
}

function duplicateWindows(windows, phase) {
  const ids = windows.map((item) => item.id);
  const contexts = windows.map((item) => item.contextHash);
  const tasks = windows.map((item) => item.taskHash);
  return new Set(ids).size !== ids.length || new Set(contexts).size !== contexts.length
    || (phase === 'held-out' && new Set(tasks).size !== tasks.length);
}

function normalizeWindows(options) {
  const { values, painExpected, minimum, phase } = options;
  validateWindowCount(values, minimum, phase);
  const windows = values.map((item) => normalizeWindow(item, painExpected));
  if (duplicateWindows(windows, phase)) {
    throw failure('SHEV_CAMPAIGN_WINDOWS_INVALID', `${phase} window identities and contexts must be unique.`);
  }
  return windows;
}

function validThresholdBounds(thresholds) {
  const nonNegative = ['minSuccessDelta', 'maxRegressionIncrease',
    'minHumanInterventionReduction', 'maxCostRatio', 'maxDurationRatio', 'maxPValue'];
  return !nonNegative.some((key) => !Number.isFinite(thresholds[key]) || thresholds[key] < 0)
    && thresholds.minSuccessDelta <= 1 && thresholds.maxCostRatio >= 1
    && thresholds.maxDurationRatio >= 1 && thresholds.maxPValue <= 1;
}

function thresholdValue(values, name, fallback) {
  return values[name] === undefined || values[name] === null ? fallback : Number(values[name]);
}

function normalizeThresholds(value = {}) {
  const thresholds = { minSuccessDelta: thresholdValue(value, 'minSuccessDelta', 0.1),
    maxRegressionIncrease: thresholdValue(value, 'maxRegressionIncrease', 0),
    minHumanInterventionReduction: thresholdValue(value, 'minHumanInterventionReduction', 0),
    maxCostRatio: thresholdValue(value, 'maxCostRatio', 1.25),
    maxDurationRatio: thresholdValue(value, 'maxDurationRatio', 1.25),
    minPainEpisodes: thresholdValue(value, 'minPainEpisodes', 3),
    minConfirmedHeldout: thresholdValue(value, 'minConfirmedHeldout', 2),
    maxPValue: thresholdValue(value, 'maxPValue', 0.05) };
  if (!validThresholdBounds(thresholds) || !positiveInteger(thresholds.minPainEpisodes)
      || !positiveInteger(thresholds.minConfirmedHeldout)) {
    throw failure('SHEV_CAMPAIGN_THRESHOLDS_INVALID', 'Pre-registered campaign thresholds are invalid.');
  }
  return thresholds;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function conditionsHash(arm) {
  return fingerprint({ modelLock: arm.modelLock, toolsLock: arm.toolsLock,
    permissionsHash: arm.permissionsHash, initialSnapshotHash: arm.initialSnapshotHash,
    budget: arm.budget, intervention: arm.intervention });
}

function matchedArms(arms, coordinator) {
  const control = normalizeArm('control', arms?.control);
  const treatment = normalizeArm('treatment', arms?.treatment);
  const projectIds = [control.scope.projectId, treatment.scope.projectId];
  const workspaces = [control.workspaceId, treatment.workspaceId];
  const locks = ['modelLock', 'toolsLock', 'permissionsHash', 'initialSnapshotHash', 'budget'];
  if (new Set(projectIds).size !== 2 || new Set(workspaces).size !== 2
      || [control, treatment].some((arm) => arm.scope.organizationId !== coordinator.organizationId)
      || locks.some((key) => fingerprint(control[key]) !== fingerprint(treatment[key]))) {
    throw failure('SHEV_CAMPAIGN_ARMS_UNMATCHED', 'Arms must be isolated, paired, and share model/tool/permission/budget/snapshot locks.');
  }
  return { control, treatment };
}

function normalizeCampaignWindows(input, mode) {
  const trainingWindows = normalizeWindows({ values: input.trainingWindows, painExpected: true,
    minimum: 5, phase: 'training' });
  const heldoutMinimum = mode === 'field' ? 20 : 5;
  const heldoutWindows = normalizeWindows({ values: input.heldoutWindows, painExpected: false,
    minimum: heldoutMinimum, phase: 'held-out' });
  const dimensions = new Set([...trainingWindows, ...heldoutWindows].map((window) => window.dimension));
  if (dimensions.size !== 1) throw failure('SHEV_CAMPAIGN_DIMENSION_MISMATCH',
    'One longitudinal campaign must track a single pre-registered capability dimension.');
  assertDisjointWindows(trainingWindows, heldoutWindows);
  return { trainingWindows, heldoutWindows };
}

function normalizedDuration(input, mode) {
  const minimumDurationMs = Number(input.minimumDurationMs ?? (mode === 'field' ? FIELD_MINIMUM_MS : 0));
  if (!Number.isSafeInteger(minimumDurationMs) || minimumDurationMs < 0) {
    throw failure('SHEV_CAMPAIGN_DURATION_INVALID', 'minimumDurationMs must be a non-negative integer.');
  }
  if (mode === 'field' && minimumDurationMs < FIELD_MINIMUM_MS) {
    throw failure('SHEV_CAMPAIGN_DURATION_INVALID', 'Field campaigns require a pre-registered minimum duration of 72 hours.');
  }
  return minimumDurationMs;
}

function createManifest(input) {
  const mode = input?.mode || 'protocol';
  if (!['protocol', 'field'].includes(mode)) throw failure('SHEV_CAMPAIGN_MODE_INVALID', 'Campaign mode must be protocol or field.');
  const coordinator = scope(input.coordinator, 'coordinator');
  const { trainingWindows, heldoutWindows } = normalizeCampaignWindows(input, mode);
  const minimumDurationMs = normalizedDuration(input, mode);
  const thresholds = normalizeThresholds(input.thresholds);
  if (mode === 'field' && thresholds.minPainEpisodes < 5) {
    throw failure('SHEV_CAMPAIGN_THRESHOLDS_INVALID', 'Field mode requires five observed pain episodes.');
  }
  const body = { schema: SCHEMA, campaignId: text(input.campaignId, 'campaignId'), mode,
    coordinator, arms: matchedArms(input.arms, coordinator), trainingWindows,
    heldoutWindows, thresholds, minimumDurationMs,
    randomizationSeed: text(input.randomizationSeed || input.campaignId, 'randomizationSeed'),
    startedAt: input.startedAt || new Date().toISOString() };
  if (!Number.isFinite(Date.parse(body.startedAt))) {
    throw failure('SHEV_CAMPAIGN_MANIFEST_INVALID', 'startedAt must be a valid timestamp.');
  }
  if (mode === 'field') validateFieldSchedule({ training: trainingWindows,
    heldout: heldoutWindows, startedAt: body.startedAt, minimumDurationMs });
  return { ...body, manifestHash: fingerprint(body), promotionEligible: false };
}

function assertDisjointWindows(training, heldout) {
  const trainHashes = new Set(training.flatMap((item) => [item.taskHash, item.contextHash]));
  if (heldout.some((item) => trainHashes.has(item.taskHash) || trainHashes.has(item.contextHash))) {
    throw failure('SHEV_CAMPAIGN_HOLDOUT_LEAKAGE', 'Held-out task/context hashes overlap training data.');
  }
}

function increasingSchedule(windows) {
  const dates = windows.map((window) => Date.parse(window.scheduledAt));
  return dates.every(Number.isFinite) && dates.every((date, index) =>
    index === 0 || date > dates[index - 1]);
}

function validateFieldSchedule(options) {
  const { training, heldout, startedAt, minimumDurationMs } = options;
  if (!increasingSchedule(training) || !increasingSchedule(heldout)) {
    throw failure('SHEV_CAMPAIGN_SCHEDULE_INVALID', 'Field windows require ordered, pre-registered timestamps.');
  }
  const firstTraining = Date.parse(training[0].scheduledAt);
  const lastTraining = Date.parse(training.at(-1).scheduledAt);
  const firstHeldout = Date.parse(heldout[0].scheduledAt);
  const lastHeldout = Date.parse(heldout.at(-1).scheduledAt);
  if (firstTraining < Date.parse(startedAt) || lastTraining >= firstHeldout
      || lastHeldout - firstTraining < minimumDurationMs) {
    throw failure('SHEV_CAMPAIGN_SCHEDULE_INVALID', 'Training must precede held-out windows across the minimum field horizon.');
  }
}

function verifyManifest(manifest) {
  if (manifest?.schema !== SCHEMA || manifest.promotionEligible !== false) {
    throw failure('SHEV_CAMPAIGN_MANIFEST_INVALID', 'A sealed developmental campaign manifest is required.');
  }
  const body = { ...manifest };
  delete body.manifestHash;
  delete body.promotionEligible;
  if (manifest.manifestHash !== fingerprint(body)) {
    throw failure('SHEV_CAMPAIGN_MANIFEST_TAMPERED', 'The pre-registered campaign manifest was altered.');
  }
  return manifest;
}

module.exports = { SCHEMA, FIELD_MINIMUM_MS, createManifest, verifyManifest,
  conditionsHash, failure, validHash };
