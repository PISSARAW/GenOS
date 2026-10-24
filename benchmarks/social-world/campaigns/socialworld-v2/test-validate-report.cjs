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
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'socialworld-v2-'));
  const repositoryRoot = path.join(temporaryRoot, 'repository');
  const reportDirectory = path.join(temporaryRoot, 'external-reports');
  const outsideDirectory = path.join(temporaryRoot, 'outside');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(reportDirectory);
  fs.mkdirSync(outsideDirectory);
  const evidencePath = path.join(reportDirectory, 'receipt.json');
  const outsideEvidence = path.join(outsideDirectory, 'receipt.json');
  fs.writeFileSync(evidencePath, '{}');
  fs.writeFileSync(outsideEvidence, '{}');
  const reportPath = path.join(reportDirectory, 'report.json');
  assert.deepEqual(validateReport(validReport('receipt.json'), reportPath, repositoryRoot), []);
  assert.match(validateReport(validReport('missing.json'), reportPath, repositoryRoot).join(' '), /cannot be resolved/);
  assert.match(validateReport(validReport('../outside/receipt.json'), reportPath, repositoryRoot).join(' '), /cannot be resolved/);
  assert.match(validateReport(validReport(outsideEvidence), reportPath, repositoryRoot).join(' '), /cannot be resolved/);
  assert.match(validateReport({ ...validReport('receipt.json'), oracle: { recalculable: false } }, reportPath, repositoryRoot).join(' '), /recalculable oracle/);
  assert.match(validateReport({ ...validReport('receipt.json'), status: 'unknown' }, reportPath, repositoryRoot).join(' '), /status must/);
  assertRejectsEscapingSymlink(reportDirectory, outsideDirectory, reportPath);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

function assertRejectsEscapingSymlink(reportDirectory, outsideDirectory, reportPath) {
  const link = path.join(reportDirectory, 'outside-link');
  try { fs.symlinkSync(outsideDirectory, link, 'junction'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return;
    throw error;
  }
  assert.match(validateReport(validReport('outside-link/receipt.json'), reportPath).join(' '), /cannot be resolved/);
}

run();
process.stdout.write('SocialWorld V2 report validator tests passed\n');
