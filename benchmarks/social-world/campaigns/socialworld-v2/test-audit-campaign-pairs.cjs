'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditCampaign, readCampaignReports } = require('./audit-campaign-pairs.cjs');

function manifest() {
  return { campaignId: 'socialworld-v2', seeds: ['s1'], arms: ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'],
    scenarios: [{ id: 'V2-01' }, { id: 'V2-03' }] };
}

function report(scenario, arm) {
  return { campaignId: 'socialworld-v2', scenario, seed: 's1', arm, attempt: 1,
    sourceCommit: 'abc123', runtimeVersion: '3', model: null, configHash: 'cfg',
    status: 'pass', startedAt: '2026-10-24T00:00:00.000Z', durationMs: 1,
    inputs: { comparison: {
    eventsHash: 'events', budgetHash: 'budget', permissionsHash: 'permissions'
    } }, observed: {}, oracle: { recalculable: true }, evidenceRefs: ['receipt.json'],
    violations: [], limitations: [] };
}

function writeJson(directory, filename, value) {
  fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(value)}\n`);
}

function testEvidenceFilesAreIgnored(reports) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'socialworld-pairs-'));
  const manifestRecord = manifest();
  try {
    reports.forEach((item, index) => writeJson(directory, `report-${index}.json`, item));
    writeJson(directory, 'pilot.evidence.json', { campaignId: 'socialworld-v2', scenario: 'V2-01',
      seed: 's1', arm: 'genos-full', processBoundaries: ['write', 'read'] });
    writeJson(directory, 'memory-state.json', { agents: [], relations: [] });
    writeJson(directory, 'receipt-details.json', { receiptId: 'receipt-1', acknowledged: true });
    const collected = readCampaignReports(directory, manifestRecord.campaignId);
    assert.equal(collected.length, reports.length);
    assert.deepEqual(auditCampaign(manifestRecord, collected), { status: 'paired', errors: [] });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function run() {
  const reports = [
    report('V2-01', 'genos-full'), report('V2-01', 'static-social-graph'),
    report('V2-01', 'llm-with-memory'), report('V2-01', 'genos-without-relational-physiology'),
    report('V2-03', 'genos-full'), report('V2-03', 'static-social-graph'), report('V2-03', 'llm-with-memory')
  ];
  assert.equal(auditCampaign(manifest(), reports).status, 'paired');
  assert.match(auditCampaign(manifest(), reports.slice(1)).errors.join(' '), /missing arm/);
  assert.match(auditCampaign(manifest(), [...reports, report('V2-03', 'genos-full')]).errors.join(' '), /duplicate report/);
  const changed = reports.map((item) => item.scenario === 'V2-03' && item.arm === 'llm-with-memory'
    ? { ...item, inputs: { comparison: { ...item.inputs.comparison, budgetHash: 'different' } } } : item);
  assert.match(auditCampaign(manifest(), changed).errors.join(' '), /causal inputs differ/);
  testEvidenceFilesAreIgnored(reports);
}

run();
process.stdout.write('SocialWorld V2 paired campaign audit tests passed\n');
