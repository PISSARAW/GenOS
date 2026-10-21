#!/usr/bin/env node
'use strict';

/**
 * Generate a real SHEV field campaign manifest with real timestamps.
 *
 * The campaign starts at the current wall-clock time and runs for at least
 * 72 hours. All timestamps are absolute ISO 8601 values. No clock
 * simulation is used: the campaign executes on real time and `tick` only
 * runs windows whose scheduledAt has arrived.
 *
 * Schedule (per protocole-campagne-terrain-shev.md, section 3):
 *   - Training: T+00:05, T+06:00, T+12:00, T+18:00, T+24:00
 *   - Held-out: T+28:00 to T+85:00, every 3 hours (20 windows)
 *
 * Usage:
 *   node bin/generate-field-manifest.cjs <campaign-id> [startedAt-iso]
 *
 * Output: writes manifest.json to stdout and to
 * backend/artifacts/field-campaign/manifest.json
 */

const fs = require('fs');
const path = require('path');
const { fingerprint } = require('../src/services/stateFingerprint');
const contract = require('../src/services/shev/developmentalCampaignContract');

const HASH = (value) => fingerprint(value);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts', 'field-campaign');
const OUT_FILE = path.join(OUT_DIR, 'manifest.json');

const HOUR = 60 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

function sharedLocks(snapshotHash) {
  return {
    initialSnapshotHash: snapshotHash,
    modelLock: { provider: 'local', digest: HASH('field-model') },
    toolsLock: { catalogDigest: HASH('field-tools') },
    permissionsHash: HASH('field-permissions'),
    budget: { costUsd: 5, tokens: 50000, seconds: 1800 },
    campaignBudget: { costUsd: 125, tokens: 1250000, seconds: 45000 },
    runtimeLock: {
      digest: HASH('field-runtime'),
      evidenceHash: HASH('field-runtime-evidence')
    },
    environmentLock: {
      digest: HASH('field-environment'),
      evidenceHash: HASH('field-environment-evidence')
    }
  };
}

function arm(name, snapshotHash, locks) {
  return {
    scope: {
      organizationId: 'org',
      projectId: `field-${name}`,
      entityId: `agent-${name}`
    },
    workspaceId: `field-workspace-${name}`,
    intervention: name === 'control' ? 'baseline' : 'full_arc',
    ...locks,
    interventionAttestation: {
      shevEnabled: name === 'treatment',
      evidenceHash: HASH(`field-intervention:${name}`)
    }
  };
}

function windows(options) {
  return Array.from({ length: options.count }, (_, index) => ({
    id: `${options.prefix}-${String(index + 1).padStart(2, '0')}`,
    taskHash: HASH(`field-${options.prefix}:task:${index + 1}`),
    contextHash: HASH(`field-${options.prefix}:context:${index + 1}`),
    dimension: 'repository-maintenance-correctness-v1',
    painExpected: options.painExpected,
    scheduledAt: new Date(options.firstAt + index * options.stepMs).toISOString()
  }));
}

function generate(campaignId, startedAtIso) {
  const startedAt = startedAtIso || new Date().toISOString();
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) {
    throw new Error(`Invalid startedAt: ${startedAt}`);
  }

  const snapshotHash = HASH(`field-snapshot:${campaignId}`);
  const locks = sharedLocks(snapshotHash);

  const manifest = contract.createManifest({
    campaignId,
    mode: 'field',
    startedAt,
    coordinator: {
      organizationId: 'org',
      projectId: 'field-coordinator',
      entityId: 'field-operator'
    },
    arms: {
      control: arm('control', snapshotHash, locks),
      treatment: arm('treatment', snapshotHash, locks)
    },
    trainingWindows: windows({
      prefix: 'train',
      count: 5,
      painExpected: true,
      firstAt: startMs + FIVE_MIN,
      stepMs: HOUR
    }),
    heldoutWindows: windows({
      prefix: 'heldout',
      count: 20,
      painExpected: false,
      firstAt: startMs + 28 * HOUR,
      stepMs: 3 * HOUR
    }),
    minimumDurationMs: contract.FIELD_MINIMUM_MS,
    thresholds: {
      minSuccessDelta: 0.1,
      maxRegressionIncrease: 0,
      minHumanInterventionReduction: 0,
      maxCostRatio: 1.25,
      maxTokenRatio: 1.25,
      maxDurationRatio: 1.25,
      minPainEpisodes: 5,
      minConfirmedHeldout: 2,
      maxPValue: 0.05
    },
    promotionEligible: false
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`);

  const firstTrain = Date.parse(manifest.trainingWindows[0].scheduledAt);
  const lastHeldout = Date.parse(manifest.heldoutWindows.at(-1).scheduledAt);
  const elapsedHours = (lastHeldout - startMs) / (1000 * 60 * 60);

  console.log(JSON.stringify(manifest, null, 2));
  console.error(`Manifest written to ${OUT_FILE}`);
  console.error(`Campaign ID: ${manifest.campaignId}`);
  console.error(`Manifest hash: ${manifest.manifestHash}`);
  console.error(`Started at: ${manifest.startedAt}`);
  console.error(`First training: ${manifest.trainingWindows[0].scheduledAt}`);
  console.error(`Last held-out: ${manifest.heldoutWindows.at(-1).scheduledAt}`);
  console.error(`Schedule span: ${elapsedHours.toFixed(1)} hours`);
  console.error(`Minimum duration: ${manifest.minimumDurationMs / (1000 * 60 * 60)} hours`);
  console.error(`Total windows: ${manifest.trainingWindows.length + manifest.heldoutWindows.length}`);
  console.error(`Total runs: ${(manifest.trainingWindows.length + manifest.heldoutWindows.length) * 2}`);
}

const campaignId = process.argv[2] || `field-campaign-${Date.now()}`;
const startedAtIso = process.argv[3];

generate(campaignId, startedAtIso);
