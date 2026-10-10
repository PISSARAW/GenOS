'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const verifier = require('../src/services/gvxVerifierRegistry');
const runner = require('../src/services/gvxBenchmarkRunner');
const datasets = require('../src/services/gvxBenchmarkDataset');

function signedResponse(input) {
  const { request, privateKey, descriptor } = input;
  const bytes = Buffer.from(request.artifactBase64, 'base64');
  const receipt = { verified: true, verifierId: descriptor.id, verifierVersion: descriptor.digest,
    artifactHash: verifier.digest(bytes), artifactRef: request.evidence.artifactRef,
    requirement: request.requirement, businessDecision: JSON.parse(bytes) };
  return { receipt, signature: crypto.sign(null, Buffer.from(JSON.stringify(receipt)), privateKey).toString('base64') };
}

async function main() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const descriptor = { id: 'p1-projection-fixture', type: 'binding-fixture', digest: 'sha256:' + '1'.repeat(64) };
  const server = http.createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer test-only');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(signedResponse({ request: payload, privateKey: keys.privateKey, descriptor })));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await checkBinding({ server, keys, descriptor }); }
  finally { server.close(); await once(server, 'close'); }
  console.log('GVX signed fixture: candidate input hash required independently of valid signature.');
}

async function checkBinding(input) {
  const task = { id: 'private', input: { prompt: 'public' }, evaluation: { answer: 'secret' } };
  const bytes = Buffer.from(JSON.stringify({ schema: datasets.SCHEMA, tasks: [task] }));
  const projected = Buffer.from(JSON.stringify({ schema: 'genos.gvx.candidate-dataset/v1', tasks: [{ id: task.id, input: task.input }] }));
  const candidateHash = verifier.digest(projected);
  const job = { variant: 'gvx', cohort: 'software', split: 'held_out', seed: 1 };
  const policy = { schema: datasets.SCHEMA, candidateHash };
  const manifest = { benchmarkId: 'binding', datasets: { heldOutHash: verifier.digest(bytes) },
    datasetPolicies: { held_out: policy }, modelLock: 'local', toolsetHash: 'tools', metrics: ['transfer'], budgetPerRun: 1 };
  const registry = verifier.fromRemoteControlPlane([input.descriptor.id], {
    url: `http://127.0.0.1:${input.server.address().port}`, publicKey: input.keys.publicKey, token: 'test-only',
    trustedVerifiers: [input.descriptor] });
  const artifacts = new Map();
  let binding = candidateHash;
  let persisted = 0;
  const options = { manifest, verifierRegistry: registry, datasetReader: async () => bytes,
    artifactReader: async ({ artifactRef }) => artifacts.get(artifactRef),
    artifactWriter: async ({ bytes: saved }) => { persisted += 1; artifacts.set('result', saved); return { artifactRef: 'result' }; },
    runners: { gvx: async () => {
      const decision = { ...job, metric: 'transfer', value: 1, datasetHash: manifest.datasets.heldOutHash,
        candidateDatasetHash: binding, modelLock: manifest.modelLock, toolsetHash: manifest.toolsetHash };
      artifacts.set('metric', Buffer.from(JSON.stringify(decision)));
      return { datasetHash: decision.datasetHash, metrics: { transfer: 1 }, cost: 0,
        evidence: [{ requirement: 'gvx-benchmark-metric:transfer', verifierId: input.descriptor.id, artifactRef: 'metric' }] };
    } } };
  assert.equal((await runner.executeJob(options, job)).candidateDatasetHash, candidateHash);
  assert.equal(persisted, 1);
  for (binding of [undefined, 'f'.repeat(64)]) {
    await assert.rejects(runner.executeJob(options, job), { code: 'GVX_CAMPAIGN_METRIC_EVIDENCE_INVALID:transfer' });
    assert.equal(persisted, 1, 'signed wrong dataset binding cannot persist a successful result');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
