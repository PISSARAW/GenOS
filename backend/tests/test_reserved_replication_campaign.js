'use strict';

const assert = require('node:assert/strict');
const replication = require('../src/services/reservedReplicationCampaignService');

function input() {
  const protocol = { model: 'fixture-v1', metric: 'fixture-pass', maxSteps: 3 };
  return { campaignId: 'reserved-fixture', protocolId: 'fixture-protocol', protocol,
    manifestHash: replication.artifactHash(protocol), seeds: [11, 23, 37], developmentSeeds: [1, 2, 3] };
}

async function main() {
  const manifest = replication.buildManifest(input());
  const results = manifest.seeds.map((seed) => ({
    seed, status: seed === 23 ? 'failed' : 'success', manifestHash: manifest.manifestHash
  }));
  const result = replication.finalizeCampaign(manifest, results);
  assert.equal(result.replayable, true);
  assert.equal(result.summary.negatives, 1);
  assert.equal(result.promotionAllowed, false);
  assert.equal(replication.finalizeCampaign(manifest, [results[0], results[0], results[2]]).replayable, false);
  assert.equal(replication.finalizeCampaign(manifest, results.slice(1)).replayable, false);
  assert.throws(() => replication.buildManifest({ ...input(), seeds: [11, 11, 37] }), /distinct/);
  assert.throws(() => replication.buildManifest({ ...input(), developmentSeeds: [11] }), /disjoint/);
  assert.throws(() => replication.finalizeCampaign({ ...manifest, protocol: {} }, results), /changed/);
  const calls = [];
  const campaign = await replication.runCampaign({ ...input(),
    preregister: async (pinned) => { calls.push('registered'); return { registrationId: 'fixture-record', manifestHash: pinned.manifestHash }; },
    runner: async ({ seed }) => {
      assert.equal(calls[0], 'registered');
      calls.push(seed);
      if (seed === 23) throw Error('negative retained');
      return { status: 'success' };
    } });
  assert.deepEqual(calls, ['registered', 11, 23, 37]);
  assert.equal(campaign.summary.negatives, 1);
  assert.equal(campaign.replayable, true);
  await assert.rejects(replication.runCampaign({ ...input(), preregister: async () => ({}),
    runner: async () => { throw Error('must not execute'); } }), /registered/);
  console.log('Reserved preregistration, disjoint seeds, protocol drift and retained negatives passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
