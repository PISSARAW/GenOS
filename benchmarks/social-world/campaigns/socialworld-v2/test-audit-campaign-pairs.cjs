'use strict';

const assert = require('node:assert/strict');
const { auditCampaign } = require('./audit-campaign-pairs.cjs');

function manifest() {
  return { seeds: ['s1'], arms: ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'],
    scenarios: [{ id: 'V2-01' }, { id: 'V2-03' }] };
}

function report(scenario, arm) {
  return { scenario, seed: 's1', arm, inputs: { comparison: {
    eventsHash: 'events', budgetHash: 'budget', permissionsHash: 'permissions'
  } } };
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
}

run();
process.stdout.write('SocialWorld V2 paired campaign audit tests passed\n');
