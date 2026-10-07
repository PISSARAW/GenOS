'use strict';

const assert = require('node:assert/strict');
const campaign = require('../src/services/conceptMechanismCampaignService');
const reserved = require('../src/services/reservedReplicationCampaignService');
const { createDb } = require('./conceptSqliteFixture');

async function main() {
  for (const probe of campaign.probes) {
    const result = await campaign.run(probe);
    assert.equal(result.status, 'supported');
    assert.equal(result.pairs.length, 5);
    assert.ok(result.pairs.every((pair) => pair.difference > 0));
    assert.equal(result.promotionAllowed, false);
    console.log(JSON.stringify({ probe, effect: result.effect.meanDifference, pairs: result.pairs.length }));
  }
  const db = await createDb();
  const protocol = { probe: 'descending_prior', softwareOnly: true,
    environmentHash: reserved.artifactHash(campaign.environment('descending_prior')) };
  try {
    const result = await reserved.runCampaign({ protocolId: 'bounded-predictive-v1', protocol,
      manifestHash: reserved.artifactHash(protocol), seeds: [101, 103, 107], developmentSeeds: [11, 23, 37, 41, 53],
      preregister: async (manifest) => {
        await db.run('INSERT INTO adaptive_state(scope,key,payload_json) VALUES(?,?,?)',
          'reserved_registration', manifest.campaignId, JSON.stringify(manifest));
        return { registrationId: manifest.campaignId, manifestHash: manifest.manifestHash };
      },
      runner: async ({ seed }) => {
        const registration = await db.get("SELECT COUNT(*) AS n FROM adaptive_state WHERE scope = 'reserved_registration'");
        assert.equal(registration.n, 1);
        const output = await campaign.run(protocol.probe, { seeds: [seed, seed + 1000, seed + 2000],
          expectedEnvironmentHash: protocol.environmentHash });
        return { status: output.status === 'supported' ? 'success' : 'inconclusive', evidence: output };
      } });
    assert.equal(result.replayable, true);
    assert.equal(result.summary.successes, 3);
    assert.equal(result.promotionAllowed, false);
  } finally { await db.close(); }
  console.log('Executed paired mechanism probes and SQLite-preregistered reserved seeds passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
