'use strict';

const assert = require('node:assert/strict');
const causal = require('../src/services/conceptCausalCampaignService');
const external = require('../src/services/externalMetacognitionCampaignService');

function fixtureInput() {
  const cases = [{ id: 'fixture-1', input: { prompt: 'Fixture only' }, target: 'answer' }];
  return { datasetId: 'MIRROR', datasetVersion: 'fixture-v1', modelVersion: 'fixture-model-v1',
    protocolVersion: 'fixture-protocol-v1', metricId: 'fixture-exact', sourceClass: 'fixture',
    sourceUrl: external.SOURCES.MIRROR, sourceRevision: 'a'.repeat(40),
    corpusHash: external.digest(cases), maxCases: 1, datasetReader: async () => cases,
    modelRunner: async (input) => { assert.equal(input.target, undefined); return { answer: 'answer' }; },
    scoreRunner: async ({ case: item, response }) => ({ score: Number(item.target === response.answer) }) };
}

async function main() {
  const local = await causal.runLocalCausalCampaign();
  assert.equal(local.receipt.contractType, 'CausalInterventionReceipt');
  assert.equal(local.pairs.length, 5);
  assert.equal(local.receipt.payload.replicates, local.pairs.length);
  assert.deepEqual(local.receipt.payload.seeds, local.pairs.map((pair) => pair.seed));
  assert.equal(local.status, 'supported');
  assert.ok(local.pairs.every((pair) => pair.difference === -1));
  assert.equal(local.promotionAllowed, false);
  console.log(JSON.stringify({ probe: 'lateral-inhibition', pairs: local.pairs.length,
    effect: local.effect, verdict: local.status, scope: 'local-software-mechanism' }));

  const missing = await external.run({ datasetId: 'SAD' });
  assert.equal(missing.status, 'not_run');
  assert.ok(missing.missing.includes('datasetReader'));
  const measured = await external.run(fixtureInput());
  assert.equal(measured.status, 'fixture_evaluated');
  assert.equal(measured.summary.coverage, 1);
  assert.equal(measured.promotionAllowed, false);
  const badHash = await external.run({ ...fixtureInput(), corpusHash: 'b'.repeat(64) });
  assert.equal(badHash.reason, 'corpus_hash_mismatch');
  const failed = await external.run({ ...fixtureInput(), sourceClass: 'external_corpus',
    modelRunner: async () => { throw Error('provider offline'); } });
  assert.equal(failed.status, 'incomplete');
  assert.equal(failed.summary.failures, 1);
  assert.equal(failed.summary.conservativeScore, 0);
  assert.equal(failed.results.length, 1);
  assert.equal((await external.run({ ...fixtureInput(), maxCases: 0 })).status, 'not_run');
  console.log('Pinned external adapter fixtures and real local causal replication passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
