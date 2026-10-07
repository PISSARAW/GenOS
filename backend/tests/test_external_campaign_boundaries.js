'use strict';

const assert = require('node:assert/strict');
const external = require('../src/services/externalMetacognitionCampaignService');

function fixture() {
  const cases = [{ id: 'one', input: { prompt: 'Synthetic case' }, target: 'gold' }];
  return { datasetId: 'SAD', sourceUrl: external.SOURCES.SAD, sourceRevision: 'a'.repeat(40),
    datasetVersion: 'fixture-v1', modelVersion: 'fixture-model', protocolVersion: 'fixture-v1',
    metricId: 'exact', seed: 11, maxCases: 1, maxCaseMs: 5000,
    corpusHash: external.digest(cases), sourceClass: 'fixture', datasetReader: async () => cases,
    modelRunner: async () => ({ answer: 'gold' }), scoreRunner: async () => ({ score: 1 }) };
}

async function mutations() {
  const input = fixture();
  input.datasetReader = async () => {
    input.modelVersion = 'tampered';
    input.modelRunner = async () => { throw Error('Must not run'); };
    return [{ id: 'one', input: { prompt: 'Synthetic case' }, target: 'gold' }];
  };
  input.scoreRunner = async ({ response }) => { response.answer = 'tampered'; return { score: 1 }; };
  const receipt = await external.run(input);
  assert.equal(receipt.status, 'fixture_evaluated');
  assert.equal(receipt.manifest.modelVersion, 'fixture-model');
  assert.equal(receipt.results[0].response.answer, 'gold');
  assert.equal(receipt.results[0].responseHash, external.digest({ answer: 'gold' }));
}

async function timeouts() {
  let calls = 0;
  let aborted = false;
  const cases = [1, 2].map((id) => ({ id: String(id), input: { prompt: 'Synthetic' } }));
  const receipt = await external.run({ ...fixture(), maxCases: 2, maxCaseMs: 10,
    corpusHash: external.digest(cases), datasetReader: async () => cases,
    modelRunner: async (_input, _manifest, { signal }) => {
      calls += 1;
      signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    } });
  assert.equal(calls, 1);
  assert.equal(aborted, true);
  assert.equal(receipt.summary.total, 2);
  assert.equal(receipt.summary.failures, 2);
  assert.equal(receipt.summary.conservativeScore, 0);
  assert.equal(receipt.results[1].status, 'not_run');
}

async function main() {
  await mutations();
  await timeouts();
  assert.equal((await external.run({ ...fixture(), seed: 'unstable' })).status, 'not_run');
  const receipt = await external.run({ ...fixture(), sourceClass: 'external_corpus' });
  assert.equal(receipt.results[0].response, undefined);
  assert.equal(receipt.results[0].responseHash.length, 64);
  assert.equal(receipt.promotionAllowed, false);
  console.log('Pinned runners, response integrity, answer minimization and bounded calls passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
