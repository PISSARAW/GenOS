'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const datasets = require('../src/services/gvxBenchmarkDataset');
const runner = require('../src/services/gvxBenchmarkRunner');
const verifier = require('../src/services/gvxVerifierRegistry');
const protocol = require('../src/services/gvxBenchmarkProtocol');

function assets() {
  const task = { id: 'case-1', input: { prompt: 'Compute 2+2', tests: [] },
    evaluation: { answer: 4, canary: 'PRIVATE_EVALUATOR_P1_V3' } };
  const bytes = Buffer.from(JSON.stringify({ schema: datasets.SCHEMA, tasks: [task] }));
  const publicBytes = Buffer.from(JSON.stringify({ schema: 'genos.gvx.candidate-dataset/v1',
    tasks: [{ id: task.id, input: task.input }] }));
  return { bytes, publicBytes, policy: { schema: datasets.SCHEMA, candidateHash: verifier.digest(publicBytes) } };
}

async function main() {
  const fixture = assets();
  const projected = datasets.candidateView(fixture.bytes, fixture.policy);
  assert.ok(projected.bytes.equals(fixture.publicBytes));
  assert.equal(projected.bytes.includes('PRIVATE_EVALUATOR'), false);
  assert.equal(projected.bytes.includes('answer'), false);
  assert.equal(projected.osIsolation, false);
  assert.equal(datasets.candidateView(fixture.bytes).separation, 'legacy_unattested');
  assert.throws(() => datasets.candidateView(fixture.bytes, { ...fixture.policy, candidateHash: 'a'.repeat(64) }),
    { code: 'GVX_CAMPAIGN_CANDIDATE_DATASET_HASH_MISMATCH' });
  const duplicate = Buffer.from(JSON.stringify({ schema: datasets.SCHEMA,
    tasks: [JSON.parse(fixture.bytes).tasks[0], JSON.parse(fixture.bytes).tasks[0]] }));
  assert.throws(() => datasets.candidateView(duplicate, fixture.policy), { code: 'GVX_CAMPAIGN_DATASET_TASK_DUPLICATE' });
  const job = { variant: 'gvx', cohort: 'software', split: 'held_out', seed: 1 };
  let called = false;
  const options = { manifest: { datasets: { heldOutHash: verifier.digest(fixture.bytes) },
    datasetPolicies: { held_out: fixture.policy }, modelLock: 'local', toolsetHash: 'tools', metrics: [], budgetPerRun: 1 },
    datasetReader: async () => fixture.bytes, runners: { gvx: async input => {
      called = true;
      assert.ok(input.dataset.equals(fixture.publicBytes));
      assert.equal(input.candidateDatasetHash, fixture.policy.candidateHash);
      return { datasetHash: input.datasetHash, metrics: {}, cost: 0 };
    } }, artifactWriter: async ({ bytes }) => { options.saved = bytes; return { artifactRef: 'result' }; },
    artifactReader: async () => options.saved };
  const result = await runner.executeJob(options, job);
  assert.equal(called, true);
  assert.equal(result.datasetSeparation, 'candidate_input_projection');
  assert.equal(JSON.parse(options.saved).candidateDatasetHash, fixture.policy.candidateHash);
  called = false;
  options.manifest.datasetPolicies.held_out.candidateHash = 'b'.repeat(64);
  await assert.rejects(runner.executeJob(options, job), { code: 'GVX_CAMPAIGN_CANDIDATE_DATASET_HASH_MISMATCH' });
  assert.equal(called, false);
  assert.ok(protocol.validateDesign({ datasetPolicies: { train: fixture.policy } }).includes('benchmark-dataset-policy-invalid'));
  console.log('GVX dataset: private evaluator projection excluded before runner call; candidate hash persisted; legacy unqualified.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
