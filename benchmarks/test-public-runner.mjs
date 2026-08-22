#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runPublicBenchmarks } from './public-runner.mjs';
import { assertValidReport } from './lib/report-policy.mjs';

const fixtureChecksum = '0'.repeat(64);

const externalVariables = [
  'GENOS_SWE_BENCH_DATASET',
  'GENOS_SWE_BENCH_SHA256',
  'GENOS_SWE_BENCH_RUNTIME_IDENTITY',
  'GENOS_SWE_BENCH_COMMAND',
  'GENOS_TERMINAL_BENCH_DATASET',
  'GENOS_TERMINAL_BENCH_SHA256',
  'GENOS_TERMINAL_BENCH_RUNTIME_IDENTITY',
  'GENOS_TERMINAL_BENCH_COMMAND',
  'GENOS_BFCL_DATASET',
  'GENOS_BFCL_COMMAND',
  'GENOS_TAU_BENCH_DATASET',
  'GENOS_TAU_BENCH_COMMAND',
  'GENOS_TOOLSANDBOX_DATASET',
  'GENOS_TOOLSANDBOX_COMMAND',
  'GENOS_WEBARENA_DATASET',
  'GENOS_WEBARENA_COMMAND',
  'GENOS_BROWSERGYM_DATASET',
  'GENOS_BROWSERGYM_COMMAND',
  'GENOS_OSWORLD_DATASET',
  'GENOS_OSWORLD_COMMAND',
];

function cleanEnvironment() {
  const environment = { ...process.env };
  for (const variable of externalVariables) delete environment[variable];
  return environment;
}

test('B06-B08 emit honest blocked reports when external inputs are absent', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-public-blocked-'));
  const summary = runPublicBenchmarks({
    taskIds: ['B06', 'B07', 'B08'],
    execute: false,
    approvalFile: null,
    outputDir,
  }, {
    environment: cleanEnvironment(),
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });

  assert.deepEqual(summary.reports.map((report) => report.status), [
    'blocked_external_dataset',
    'blocked_external_dataset',
    'blocked_external_dataset',
  ]);

  for (const deliverable of ['swe-public-report.json', 'tool-use-public-report.json', 'web-public-report.json']) {
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, deliverable), 'utf8'));
    assert.equal(report.aggregate_score, null);
    assert.equal(report.claim_status, 'not_claimable');
    assert.equal(report.execution.attempted, false);
    assert.ok(report.components.every((component) => component.score === null));
    assert.doesNotThrow(() => assertValidReport(report));
  }
});

test('approved component commands execute through argv and remain pending audit', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-public-execute-'));
  const datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-public-data-'));
  const approvalFile = path.join(outputDir, 'approval.json');
  fs.writeFileSync(approvalFile, JSON.stringify({
    approval_id: 'approval-test-1',
    approved_by: 'benchmark-owner',
    approved_at: '2026-08-22T00:00:00.000Z',
    tasks: {
      B06: {
        dataset_approved: true,
        runtime_approved: true,
        comparison_approved: true,
        dataset_checksums: {
          'swe-bench': fixtureChecksum,
          'terminal-bench': fixtureChecksum,
        },
        runtime_identities: {
          'swe-bench': 'fixture-runtime-v1',
          'terminal-bench': 'fixture-runtime-v1',
        },
        comparison_conditions_sha256: fixtureChecksum,
      },
    },
  }));

  const script = [
    "const fs=require('node:fs')",
    "fs.writeFileSync(process.env.GENOS_BENCHMARK_RESULT_FILE, JSON.stringify({score:0.5,metrics:{pass_rate:0.5},sample_count:2,dataset_revision:'fixture-v1',dataset_checksum:'0000000000000000000000000000000000000000000000000000000000000000',runtime:{identity:'fixture-runtime-v1'}}))",
  ].join(';');
  const command = JSON.stringify([process.execPath, '-e', script]);
  const environment = {
    ...cleanEnvironment(),
    GENOS_SWE_BENCH_DATASET: datasetDir,
    GENOS_SWE_BENCH_SHA256: fixtureChecksum,
    GENOS_SWE_BENCH_RUNTIME_IDENTITY: 'fixture-runtime-v1',
    GENOS_SWE_BENCH_COMMAND: command,
    GENOS_TERMINAL_BENCH_DATASET: datasetDir,
    GENOS_TERMINAL_BENCH_SHA256: fixtureChecksum,
    GENOS_TERMINAL_BENCH_RUNTIME_IDENTITY: 'fixture-runtime-v1',
    GENOS_TERMINAL_BENCH_COMMAND: command,
  };

  const summary = runPublicBenchmarks({
    taskIds: ['B06'],
    execute: true,
    approvalFile,
    outputDir,
  }, {
    environment,
    now: () => new Date('2026-08-22T00:00:00.000Z'),
  });
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'swe-public-report.json'), 'utf8'));

  assert.equal(summary.reports[0].status, 'executed_pending_audit');
  assert.equal(report.execution.attempted, true);
  assert.equal(report.audit.status, 'pending');
  assert.equal(report.claim_status, 'not_claimable');
  assert.equal(report.aggregate_score, null);
  assert.deepEqual(report.components.map((component) => component.score), [0.5, 0.5]);
  assert.doesNotThrow(() => assertValidReport(report));
});

test('dataset approval alone reports the remaining runtime block', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-public-runtime-'));
  const datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-public-data-'));
  const approvalFile = path.join(outputDir, 'approval.json');
  fs.writeFileSync(approvalFile, JSON.stringify({
    approval_id: 'approval-test-2',
    approved_by: 'benchmark-owner',
    approved_at: '2026-08-22T00:00:00.000Z',
    tasks: {
      B06: {
        dataset_approved: true,
        dataset_checksums: {
          'swe-bench': fixtureChecksum,
          'terminal-bench': fixtureChecksum,
        },
      },
    },
  }));
  const environment = {
    ...cleanEnvironment(),
    GENOS_SWE_BENCH_DATASET: datasetDir,
    GENOS_SWE_BENCH_SHA256: fixtureChecksum,
    GENOS_TERMINAL_BENCH_DATASET: datasetDir,
    GENOS_TERMINAL_BENCH_SHA256: fixtureChecksum,
  };

  const summary = runPublicBenchmarks({
    taskIds: ['B06'],
    execute: false,
    approvalFile,
    outputDir,
  }, { environment });

  assert.equal(summary.reports[0].status, 'blocked_external_runtime');
});

test('a component failure preserves completed evidence and stops the task', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-public-failure-'));
  const datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-public-data-'));
  const approvalFile = path.join(outputDir, 'approval.json');
  fs.writeFileSync(approvalFile, JSON.stringify({
    approval_id: 'approval-test-3',
    approved_by: 'benchmark-owner',
    approved_at: '2026-08-22T00:00:00.000Z',
    tasks: {
      B06: {
        dataset_approved: true,
        runtime_approved: true,
        comparison_approved: true,
        dataset_checksums: {
          'swe-bench': fixtureChecksum,
          'terminal-bench': fixtureChecksum,
        },
        runtime_identities: {
          'swe-bench': 'fixture-runtime-v1',
          'terminal-bench': 'fixture-runtime-v1',
        },
        comparison_conditions_sha256: fixtureChecksum,
      },
    },
  }));
  const successScript = "const fs=require('node:fs');fs.writeFileSync(process.env.GENOS_BENCHMARK_RESULT_FILE,JSON.stringify({score:1,metrics:{pass_rate:1},sample_count:1,dataset_revision:'fixture-v1',dataset_checksum:'0000000000000000000000000000000000000000000000000000000000000000',runtime:{identity:'fixture-runtime-v1'}}))";
  const environment = {
    ...cleanEnvironment(),
    GENOS_SWE_BENCH_DATASET: datasetDir,
    GENOS_SWE_BENCH_SHA256: fixtureChecksum,
    GENOS_SWE_BENCH_RUNTIME_IDENTITY: 'fixture-runtime-v1',
    GENOS_SWE_BENCH_COMMAND: JSON.stringify([process.execPath, '-e', successScript]),
    GENOS_TERMINAL_BENCH_DATASET: datasetDir,
    GENOS_TERMINAL_BENCH_SHA256: fixtureChecksum,
    GENOS_TERMINAL_BENCH_RUNTIME_IDENTITY: 'fixture-runtime-v1',
    GENOS_TERMINAL_BENCH_COMMAND: JSON.stringify([process.execPath, '-e', 'process.exit(9)']),
  };

  const summary = runPublicBenchmarks({
    taskIds: ['B06'],
    execute: true,
    approvalFile,
    outputDir,
  }, { environment });
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'swe-public-report.json'), 'utf8'));

  assert.equal(summary.reports[0].status, 'execution_failed');
  assert.equal(report.components[0].status, 'executed_pending_audit');
  assert.equal(report.components[0].score, 1);
  assert.equal(report.components[1].status, 'execution_failed');
  assert.equal(report.components[1].evidence.exit_code, 9);
});
