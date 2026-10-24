'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditCampaign, readReportFiles } = require('./audit-campaign-pairs.cjs');

const HASHES = {
  eventsHash: '1'.repeat(64), budgetHash: '2'.repeat(64), permissionsHash: '3'.repeat(64)
};

function manifest() {
  return {
    campaignId: 'socialworld-v2', seeds: ['s1'], arms: ['full', 'static'],
    allowedStatuses: ['pass', 'fail', 'inconclusive'],
    scenarios: [{ id: 'V2-01' }, { id: 'V2-03' }],
    comparisonArms: { 'V2-01': ['full', 'static'], 'V2-03': ['full', 'static'] }
  };
}

function report(scenario, arm, overrides = {}) {
  return {
    campaignId: 'socialworld-v2', scenario, seed: 's1', arm, attempt: 1,
    sourceCommit: 'commit-1', runtimeVersion: '3', model: null, configHash: '4'.repeat(64),
    status: 'pass', startedAt: '2026-10-24T00:00:00.000Z', durationMs: 5,
    inputs: { comparison: { ...HASHES } }, observed: {}, oracle: { recalculable: true },
    evidenceRefs: ['evidence.json'], violations: [], limitations: [], ...overrides
  };
}

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function addRecord(directory, filename, value) {
  const reportPath = path.join(directory, filename);
  writeJson(reportPath, value);
  return { report: value, reportPath };
}

function run() {
  const root = path.resolve(__dirname, '../../../..');
  const directory = fs.mkdtempSync(path.join(root, '.tmp-socialworld-v2-audit-'));
  try {
    writeJson(path.join(directory, 'evidence.json'), { receipt: 'test-proof' });
    const validRecords = [
      addRecord(directory, 'v201-full.json', report('V2-01', 'full')),
      addRecord(directory, 'v201-static.json', report('V2-01', 'static')),
      addRecord(directory, 'v203-full.json', report('V2-03', 'full')),
      addRecord(directory, 'v203-static.json', report('V2-03', 'static'))
    ];
    writeJson(path.join(directory, 'v201-full.evidence.json'), { receipt: 'not-a-report' });
    const loaded = readReportFiles(directory);
    assert.equal(loaded.errors.length, 0);
    assert.equal(loaded.records.length, 4);
    assert.equal(auditCampaign(manifest(), loaded.records, root).status, 'paired');

    writeJson(path.join(directory, 'v2-03-diagnostic.json'), {
      ...report('V2-03', 'full'), campaignDisposition: 'diagnostic-pilot',
      inputs: { processBoundaries: 3, durableDatabase: true }
    });
    const withoutDiagnosticPilot = readReportFiles(directory);
    assert.equal(withoutDiagnosticPilot.errors.length, 0);
    assert.equal(withoutDiagnosticPilot.records.length, 4);

    const missing = auditCampaign(manifest(), validRecords.slice(1), root);
    assert.match(missing.errors.join(' '), /missing arm/);

    const duplicate = auditCampaign(manifest(), [...validRecords, validRecords[0]], root);
    assert.match(duplicate.errors.join(' '), /duplicate report/);

    const mismatched = validRecords.map((record) => record.report.scenario === 'V2-03'
      && record.report.arm === 'static'
      ? { ...record, report: { ...record.report, inputs: { comparison: { ...HASHES, budgetHash: '5'.repeat(64) } } } }
      : record);
    assert.match(auditCampaign(manifest(), mismatched, root).errors.join(' '), /causal inputs differ/);

    const missingHash = validRecords.map((record) => record.report.arm === 'full'
      ? { ...record, report: { ...record.report, inputs: { comparison: { ...HASHES, eventsHash: '' } } } } : record);
    assert.match(auditCampaign(manifest(), missingHash, root).errors.join(' '), /SHA-256/);

    const extraArm = [...validRecords, addRecord(directory, 'v201-extra.json', report('V2-01', 'unregistered'))];
    assert.match(auditCampaign(manifest(), extraArm, root).errors.join(' '), /unexpected arm/);

    const badStatus = validRecords.map((record) => record.report.arm === 'full'
      ? { ...record, report: { ...record.report, status: 'maybe' } } : record);
    assert.match(auditCampaign(manifest(), badStatus, root).errors.join(' '), /status must be/);

    const badSchema = validRecords.map((record) => record.report.arm === 'full'
      ? { ...record, report: { ...record.report, durationMs: undefined } } : record);
    assert.match(auditCampaign(manifest(), badSchema, root).errors.join(' '), /durationMs must be non-negative/);

    const malformed = auditCampaign(manifest(), [{ report: null, reportPath: path.join(directory, 'broken.json') }], root);
    assert.equal(malformed.status, 'inconclusive');
    assert.equal(malformed.reportStatusCounts.invalid, 1);

    const invalidManifest = manifest();
    invalidManifest.allowedStatuses = ['pass', 'maybe'];
    assert.match(auditCampaign(invalidManifest, validRecords, root).errors.join(' '), /invalid status/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run();
process.stdout.write('SocialWorld V2 paired campaign audit tests passed\n');
