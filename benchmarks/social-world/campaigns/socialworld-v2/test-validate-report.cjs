'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateReport } = require('./validate-report.cjs');

function validReport(evidencePath) {
  return {
    campaignId: 'socialworld-v2', scenario: 'V2-03', arm: 'genos-full', seed: 'seed-01',
    attempt: 1, sourceCommit: 'abc123', runtimeVersion: '3', model: null, configHash: 'cfg',
    status: 'pass', startedAt: '2026-10-24T00:00:00.000Z', durationMs: 10,
    inputs: {}, observed: {}, oracle: { recalculable: true }, evidenceRefs: [evidencePath],
    violations: [], limitations: []
  };
}

function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'socialworld-v2-'));
  const evidencePath = path.join(directory, 'receipt.json');
  fs.writeFileSync(evidencePath, '{}');
  const repositoryRoot = directory;
  const reportPath = path.join(directory, 'report.json');
  assert.deepEqual(validateReport(validReport('receipt.json'), reportPath, repositoryRoot), []);
  assert.match(validateReport({ ...validReport('missing.json') }, reportPath, repositoryRoot).join(' '), /cannot be resolved/);
  assert.match(validateReport({ ...validReport('receipt.json'), oracle: { recalculable: false } }, reportPath, repositoryRoot).join(' '), /recalculable oracle/);
  assert.match(validateReport({ ...validReport('receipt.json'), status: 'unknown' }, reportPath, repositoryRoot).join(' '), /status must be/);
  fs.rmSync(directory, { recursive: true, force: true });
}

run();
process.stdout.write('SocialWorld V2 report validator tests passed\n');
