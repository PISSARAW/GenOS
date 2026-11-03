'use strict';

const assert = require('node:assert/strict');
const profiles = require('../src/services/activationProfiles');
const campaign = require('../src/services/compositionCampaign');
const { digest } = require('../src/services/qualityElevation/qualityContract');

function activation() {
  assert.throws(() => profiles.profile('unbounded'), /UNKNOWN/);
  const selected = profiles.profile('resident');
  const report = profiles.inspect({ profile: 'resident', env: selected.env,
    ett: { enabled: true } });
  assert.equal(report.dependenciesReady, false);
  assert.ok(report.mechanisms.ett.missing.includes('authorize'));
  assert.ok(report.mechanisms.ett.missing.includes('sandbox'));
  assert.equal(report.activated, null);
  assert.equal(report.qualified, null);
  assert.deepEqual(profiles.profile('observe').executionPolicy, { gqwfV2: false });
}

async function ablations() {
  const requests = [];
  const input = { components: ['memory', 'repair'], seeds: [2, 3], budget: { tokens: 20, calls: 2 },
    execute: async request => {
      requests.push(request);
      return { artifact: request.components.length, usage: { tokens: 10, calls: 1 } };
    },
    verify: async request => ({ passed: request.artifact === 2,
      artifactDigest: digest(request.artifact), evidenceRefs: ['finite-test:both-components'] }) };
  const result = await campaign.run(input);
  assert.equal(result.results.length, 8);
  assert.ok(requests.every(request => request.budget.tokens === 20 && request.budget.calls === 2));
  assert.ok(result.comparisons.every(item => item.verifiedSuccessDelta === 1));
  assert.equal(result.promotionEligible, false);
  const over = await campaign.run({ ...input, execute: async () =>
    ({ artifact: 2, usage: { tokens: 21, calls: 1 } }) });
  assert.ok(over.results.every(item => !item.verified && !item.withinBudget));
  await assert.rejects(campaign.run({ ...input, components: ['memory', 'memory'] }), /INVALID/);
}

async function main() { activation(); await ablations(); console.log('Inventory P1 profiles and equal-budget ablations: PASS. Synthetic executor only.'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
