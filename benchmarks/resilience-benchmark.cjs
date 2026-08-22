#!/usr/bin/env node

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const {
  evaluateApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis
} = require('../backend/src/services/resilienceService');

function integerArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number.parseInt(process.argv[index + 1], 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function stringArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / sorted.length;
  const percentile = quantile => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
  return {
    p50: percentile(0.50),
    p95: percentile(0.95),
    p99: percentile(0.99),
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

function gitRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (_) {
    return 'unknown';
  }
}

async function main() {
  const iterations = integerArgument('--iterations', 500);
  const warmups = integerArgument('--warmups', 20);
  const freezeDurationsNs = [];
  const thawDurationsNs = [];
  const snapshotIds = new Set();
  let successfulRecoveries = 0;
  let integrityVerified = 0;
  let invalidSnapshotsRejected = 0;

  const injectionResults = [];
  const thresholdCases = [
    ['consecutive_failures', { consecutiveFailures: 3 }, true],
    ['budget_exhaustion', { costUsd: 1.01 }, true],
    ['semantic_divergence', { semanticDivergence: 0.54 }, true],
    ['hallucination_limit', { hallucinations: 2 }, true],
    ['below_all_thresholds', { consecutiveFailures: 2, costUsd: 0.99, semanticDivergence: 0.56, hallucinations: 1 }, false]
  ];
  for (const [fault, metrics, expectedTermination] of thresholdCases) {
    const result = await evaluateApoptosis(`benchmark-${fault}`, metrics);
    injectionResults.push({
      fault,
      expected_termination: expectedTermination,
      observed_termination: result.apoptosisExecuted,
      passed: result.apoptosisExecuted === expectedTermination
    });
  }

  for (let index = 0; index < warmups + iterations; index += 1) {
    const workspaceId = `benchmark-workspace-${index % 7}`;
    const agents = [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }];
    const freezeStarted = performance.now();
    const frozen = freezeCryptobiosis(workspaceId, 'benchmark fault checkpoint', {
      agents,
      scratchpads: { alpha: `state-${index}` },
      messageQueues: [{ from: 'alpha', to: 'beta', sequence: index }]
    });
    const freezeElapsedNs = (performance.now() - freezeStarted) * 1e6;
    snapshotIds.add(frozen.snapshotId);

    const thawStarted = performance.now();
    const thawed = thawCryptobiosis(frozen.snapshotId, `recovery-${workspaceId}`);
    const thawElapsedNs = (performance.now() - thawStarted) * 1e6;
    if (index >= warmups) {
      freezeDurationsNs.push(freezeElapsedNs);
      thawDurationsNs.push(thawElapsedNs);
      successfulRecoveries += Number(thawed.success && thawed.revivedAgentCount === agents.length);
      integrityVerified += Number(thawed.integrityVerified && thawed.checksum === frozen.checksum);
    }
  }

  for (let index = 0; index < iterations; index += 1) {
    try {
      thawCryptobiosis(`cryo_injected_missing_${index}`);
    } catch (error) {
      invalidSnapshotsRejected += Number(error.code === 'SNAPSHOT_NOT_FOUND');
    }
  }

  const uniqueSnapshotsExpected = warmups + iterations;
  const thresholdPasses = injectionResults.filter(result => result.passed).length;
  const report = {
    benchmark: 'genos.resilience.fault_injection_and_recovery',
    iterations,
    warmups,
    fault_profile: [
      'apoptosis_threshold_crossing',
      'apoptosis_boundary_non_trigger',
      'rapid_snapshot_id_collision',
      'snapshot_integrity_verification',
      'missing_snapshot_recovery'
    ],
    recovery: {
      successful_recoveries: successfulRecoveries,
      recovery_success_rate: successfulRecoveries / iterations,
      integrity_verification_rate: integrityVerified / iterations,
      missing_snapshot_rejection_rate: invalidSnapshotsRejected / iterations,
      unique_snapshot_id_rate: snapshotIds.size / uniqueSnapshotsExpected,
      threshold_detection_rate: thresholdPasses / injectionResults.length
    },
    injection_results: injectionResults,
    freeze_latency_ns: summarize(freezeDurationsNs),
    thaw_latency_ns: summarize(thawDurationsNs),
    platform: {
      os: process.platform,
      arch: process.arch,
      runtime: process.version,
      hostname: os.hostname()
    },
    repository_revision: gitRevision(),
    command_line: process.argv
  };

  const allPassed = Object.values(report.recovery).every(value => value === iterations || value === 1);
  if (!allPassed) process.exitCode = 1;
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const output = stringArgument('--output');
  if (output) {
    const target = path.resolve(output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialized);
  }
  process.stdout.write(serialized);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
