'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { assessReadiness } = require('./campaign-proof-readiness.cjs');
const manifest = require('./manifest.json');

function fixture(status) {
  return {
    campaignId: 'socialworld-v2', status, seeds: ['seed-1'], arms: ['full', 'static'],
    allowedStatuses: ['pass', 'fail', 'inconclusive'],
    scenarios: [{ id: 'V2-01' }], comparisonArms: { 'V2-01': ['full', 'static'] }
  };
}

function run() {
  const root = path.resolve(__dirname, '../../../..');
  const planned = assessReadiness(fixture('planned'), root);
  assert.equal(planned.status, 'inconclusive');
  assert.equal(planned.canLaunch, false);
  assert.equal(planned.campaignConclusion, 'not-assessed');
  assert.equal(planned.missingCausalArms.length, 2);
  const readyManifest = assessReadiness(fixture('ready'), root, {
    'V2-01': { path: 'missing-causal-runner.cjs', arms: ['full', 'static'] }
  });
  assert.equal(readyManifest.status, 'inconclusive');
  assert.equal(readyManifest.canLaunch, false);
  assert.equal(readyManifest.missingCausalArms.length, 2);

  const campaign = assessReadiness(manifest, root);
  assert.equal(campaign.missingCausalArms.length, 0, 'all manifest arms must have a declared runner entry');
  assert.ok(campaign.missingExecutableArms.length > 0, 'unsupported causal treatments must remain explicit');
  assert.equal(campaign.canLaunch, false, 'registered inconclusive wrappers are not executable proof arms');
}

run();
process.stdout.write('SocialWorld V2 campaign readiness remains fail-closed for unimplemented runners\n');
