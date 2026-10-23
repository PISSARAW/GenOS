#!/usr/bin/env node
'use strict';

/**
 * SHEV field campaign orchestrator — real-time execution driver.
 *
 * This script drives a sealed field campaign to completion over its real
 * scheduled horizon (≥72 h). It does not simulate time: it sleeps until each
 * window's `scheduledAt` arrives, then invokes `tick` once for that due set.
 *
 * Usage:
 *   node bin/run-field-campaign-orchestrator.cjs --campaign-dir <path> [--adapter <path>]
 *
 * The orchestrator:
 *   - Reads the sealed manifest from the campaign directory
 *   - Computes the ordered set of due windows from real wall-clock time
 *   - Sleeps until the next window's scheduledAt
 *   - Runs `tick` (idempotent: already-run windows are skipped)
 *   - Repeats until all 50 runs are complete
 *   - Runs `export` to produce the final content-addressed dossier
 *   - Prints a machine-readable progress line after every tick
 *
 * Environment:
 *   GENOS_FIELD_TEST_ROOT   — repository root (for adapter module resolution)
 *   SHEV_FIELD_TEST_EXECUTION_LOG — optional execution audit log path
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'run-shev-field-campaign.cjs');

function parseArgs(argv) {
  const args = { campaignDir: undefined, adapter: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--campaign-dir' && argv[i + 1] !== undefined) {
      args.campaignDir = argv[i + 1];
      i += 1;
    } else if (arg === '--adapter' && argv[i + 1] !== undefined) {
      args.adapter = argv[i + 1];
      i += 1;
    }
  }
  if (!args.campaignDir) {
    throw new Error('--campaign-dir is required.');
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCli(command, campaignDir, adapter) {
  const cmdArgs = [command, '--campaign-dir', campaignDir];
  if (adapter) cmdArgs.push('--adapter', adapter);
  const result = spawnSync(process.execPath, [CLI, ...cmdArgs], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`CLI ${command} failed (exit ${result.status}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function nowIso() {
  return new Date().toISOString();
}

function log(level, message) {
  process.stdout.write(`[${nowIso()}] [${level}] ${message}\n`);
}

function loadManifest(campaignDir) {
  const seal = loadSeal(campaignDir);
  const manifest = seal.manifest;
  if (manifest.mode !== 'field') {
    throw new Error(`Campaign mode is ${manifest.mode}, expected 'field'.`);
  }
  return manifest;
}

function loadSeal(campaignDir) {
  const sealPath = path.join(campaignDir, 'seal.json');
  if (!fs.existsSync(sealPath)) {
    throw new Error(`No seal found at ${sealPath}. Run 'seal' first.`);
  }
  return JSON.parse(fs.readFileSync(sealPath, 'utf8'));
}

function resolveAdapter(campaignDir, override) {
  const lockedPath = loadSeal(campaignDir).adapter?.path;
  if (typeof lockedPath !== 'string' || !path.isAbsolute(lockedPath)) {
    throw new Error('Sealed campaign does not contain an absolute adapter lock.');
  }
  if (override && path.resolve(override) !== path.resolve(lockedPath)) {
    throw new Error('Requested adapter path differs from the sealed campaign adapter.');
  }
  return lockedPath;
}

function campaignWindows(manifest) {
  const allWindows = [
    ...manifest.trainingWindows.map((w) => ({ ...w, phase: 'training' })),
    ...manifest.heldoutWindows.map((w) => ({ ...w, phase: 'heldout' }))
  ];
  allWindows.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  return allWindows;
}

function logSchedule(manifest, allWindows) {
  log('INFO', `Campaign ${manifest.campaignId} (${manifest.manifestHash})`);
  log('INFO', `Started at: ${manifest.startedAt}`);
  log('INFO', `Total windows: ${allWindows.length} (training: ${manifest.trainingWindows.length}, heldout: ${manifest.heldoutWindows.length})`);
  log('INFO', `First window: ${allWindows[0].scheduledAt}`);
  log('INFO', `Last window: ${allWindows[allWindows.length - 1].scheduledAt}`);
  log('INFO', `Minimum duration: ${manifest.minimumDurationMs / 3600000} h`);
}

async function runCampaign(allWindows, campaignDir, adapter) {
  for (let round = 0; round < 1000; round += 1) {
    const now = Date.now();

    // Find the next due window that hasn't been run yet.
    // We rely on tick's idempotency: it skips already-run windows.
    // We sleep until the earliest window whose scheduledAt <= now.
    const dueWindows = allWindows.filter((w) => Date.parse(w.scheduledAt) <= now);

    if (dueWindows.length === 0) {
      // No windows due yet. Sleep until the next one.
      const nextWindow = allWindows.find((w) => Date.parse(w.scheduledAt) > now);
      if (!nextWindow) {
        // All windows have scheduled times in the past. Run a final tick
        // to capture any remaining, then check duration.
        break;
      }
      const sleepMs = Date.parse(nextWindow.scheduledAt) - now + 1000;
      log('INFO', `No windows due. Next: ${nextWindow.id} (${nextWindow.scheduledAt}), sleeping ${Math.round(sleepMs / 1000)}s`);
      await sleep(Math.min(sleepMs, 3600000)); // cap sleep at 1 h to allow signal checks
      continue;
    }

    log('INFO', `Tick: ${dueWindows.length} window(s) due`);
    const result = runCli('tick', campaignDir, adapter);
    const report = result.report;

    log('INFO', `Tick complete: status=${report.status}, complete=${report.complete}, durationMet=${report.durationMet}`);
    log('INFO', `  control: ${report.arms.control.windows} runs, treatment: ${report.arms.treatment.windows} runs`);
    log('INFO', `  elapsed: ${(report.elapsedMs / 3600000).toFixed(2)} h`);

    if (report.complete && report.durationMet) {
      log('INFO', 'Campaign complete and duration horizon met.');
      break;
    }

    if (report.status === 'hypothesis_not_supported') {
      log('WARN', 'Campaign terminal: hypothesis_not_supported');
      break;
    }
  }
}

function finishCampaign(campaignDir, adapter) {
  const statusResult = runCli('status', campaignDir, adapter);
  log('INFO', `Final status: ${statusResult.status}`);
  log('INFO', `  runs: control=${JSON.stringify(statusResult.runs.control)}, treatment=${JSON.stringify(statusResult.runs.treatment)}`);

  log('INFO', 'Exporting final dossier...');
  const exportResult = runCli('export', campaignDir, adapter);
  log('INFO', `Export: ${exportResult.file}`);
  log('INFO', `Export hash: ${exportResult.exportHash}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const campaignDir = path.resolve(args.campaignDir);
  const adapter = resolveAdapter(campaignDir, args.adapter);
  const manifest = loadManifest(campaignDir);
  const allWindows = campaignWindows(manifest);
  logSchedule(manifest, allWindows);
  await runCampaign(allWindows, campaignDir, adapter);
  finishCampaign(campaignDir, adapter);

  log('INFO', 'Orchestrator finished.');
}

if (require.main === module) {
  main().catch((error) => {
    log('ERROR', error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, loadManifest, resolveAdapter };
