'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluateCampaign } = require('../src/services/socialWorldCampaignAggregate');

function writeAttempt(input) {
  const { root, seed, attempt, status } = input;
  const directory = path.join(root, seed, `attempt-${String(attempt).padStart(3, '0')}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ seed, attempt, status }));
}

function manifest() {
  return { campaignId: 'fixture', minimumSeeds: 20, passThreshold: 18,
    seeds: Array.from({ length: 20 }, (_, index) => `seed-${String(index + 1).padStart(2, '0')}`) };
}

function fakeValidator(report) {
  return { valid: true, status: report.status, errors: [] };
}

function testAggregation(root) {
  const contract = manifest();
  for (const seed of contract.seeds.slice(0, 18)) writeAttempt({ root, seed, attempt: 1, status: 'pass' });
  writeAttempt({ root, seed: contract.seeds[17], attempt: 1, status: 'inconclusive' });
  writeAttempt({ root, seed: contract.seeds[17], attempt: 2, status: 'pass' });
  writeAttempt({ root, seed: contract.seeds[18], attempt: 1, status: 'fail' });
  writeAttempt({ root, seed: contract.seeds[19], attempt: 1, status: 'inconclusive' });
  const result = evaluateCampaign({ reportsRoot: root, manifest: contract, validateReport: fakeValidator });
  assert.equal(result.status, 'pass');
  assert.equal(result.counts.pass, 18);
  assert.deepEqual(result.seeds[17].attempts.map((item) => item.status), ['inconclusive', 'pass']);
  assert.equal(result.seeds[18].status, 'fail');
  assert.equal(result.seeds[19].status, 'inconclusive');
}

function testStickyFail(root) {
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
  const contract = manifest();
  writeAttempt({ root, seed: contract.seeds[0], attempt: 1, status: 'fail' });
  writeAttempt({ root, seed: contract.seeds[0], attempt: 2, status: 'pass' });
  for (const seed of contract.seeds.slice(1, 18)) writeAttempt({ root, seed, attempt: 1, status: 'pass' });
  writeAttempt({ root, seed: contract.seeds[18], attempt: 1, status: 'inconclusive' });
  writeAttempt({ root, seed: contract.seeds[19], attempt: 1, status: 'inconclusive' });
  const result = evaluateCampaign({ reportsRoot: root, manifest: contract, validateReport: fakeValidator });
  assert.equal(result.seeds[0].status, 'fail');
  assert.equal(result.status, 'inconclusive');
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'socialworld-aggregate-'));
  try { testAggregation(root); testStickyFail(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
  console.log('SocialWorld campaign aggregation preserves attempts, sticky failures and 18/20 threshold.');
}

try { main(); }
catch (error) { console.error(error.stack || error.message); process.exit(1); }
