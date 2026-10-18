'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const gate = require('../src/services/morphogenesis/synthesis/pairedCampaignGate');
const { runPairedCampaignPhase, shaDataset } = require('../src/services/morphogenesis/synthesis/pairedCampaignRunner');
const { PairedCampaignStore } = require('../src/services/morphogenesis/synthesis/pairedCampaignStore');
const { executeProcessAdapter, shaFile } = require('../src/services/morphogenesis/synthesis/processCampaignAdapter');
const { ADAPTER_SCHEMA, adapterSigningBytes } = require('../src/services/morphogenesis/synthesis/externalAdapterAttestation');

const PLAN = Object.freeze({ alpha: 0.05, bootstrapSamples: 1000,
  minShadowPairs: 1, minHoldoutPairs: 10, minEffect: 0.05,
  maxCostOverhead: 0.1, seed: 20261018, multiplicityCorrection: 'bonferroni' });

function dataset(split, count) {
  return { schema: 'genos.morphogenesis.p3-dataset/v1', datasetId: `${split}-p3-v1`, split,
    selectorAccess: split === 'holdout' ? false : true,
    tasks: Array.from({ length: count }, (_, index) => ({ taskId: `${split}-task-${index}`,
      taskFamily: `${split}-family-${index}`, prompt: `Solve ${split} mission ${index}`,
      seeds: [1000 + index], oracleId: `${split}-oracle-${index}`,
      oracleSha256: `sha256:${split === 'shadow' ? 'a' : 'b'}${'c'.repeat(63)}` })) };
}

function manifest(datasets) {
  const statisticalPlan = { ...PLAN };
  return { campaignId: 'morphogenesis-p3-campaign', status: 'preregistered',
    registeredAt: '2026-10-18T08:00:00.000Z', statisticalPlan,
    statisticalPlanHash: gate.hashStatisticalPlan(statisticalPlan),
    datasets: { shadow: { datasetId: datasets.shadow.datasetId, sha256: shaDataset(datasets.shadow) },
      holdout: { datasetId: datasets.holdout.datasetId, sha256: shaDataset(datasets.holdout),
        sealedAt: '2026-10-18T07:00:00.000Z', selectorAccess: false } },
    execution: { modelId: 'paired-model-v1', budgetTokens: 1000, latencyBudgetMs: 60000,
      toolPolicyHash: 'sha256:tools-none', environmentHash: 'sha256:environment-frozen' } };
}

function adapterIdentity(conditionId) {
  const external = { 'langgraph-static': 'langgraph',
    'autogen-graphflow-swarm': 'autogen-graphflow', 'mass-evomas': 'evomas' };
  if (external[conditionId]) return { provenance: 'external-paired', framework: external[conditionId] };
  return { provenance: conditionId === 'single-agent' ? 'local-baseline' : 'local-runtime',
    framework: conditionId };
}

function adapters() {
  return Object.fromEntries(gate.REQUIRED_CONDITIONS.map(conditionId => [conditionId,
    { driver: 'fixture', adapterVersion: 'fixture-v1', ...adapterIdentity(conditionId) }]));
}

function fakeAdapter(counter) {
  return async input => {
    counter.count += 1;
    const forbidden = ['split', 'datasetId', 'oracleId', 'taskId']
      .some(field => Object.prototype.hasOwnProperty.call(input.request, field));
    const adaptive = input.request.conditionId === gate.ADAPTIVE_CONDITION;
    return { candidate: { solved: true, forbidden, score: adaptive ? 0.9 : 0.4 },
      metrics: { tokens: 10, latencyMs: 1, cost: adaptive ? 0.02 : 0.01 },
      provenance: input.config.provenance, framework: input.config.framework,
      adapterVersion: input.config.adapterVersion, executionVerified: true,
      realExecution: true, budgetExceeded: false,
      adapterReceipt: { fixture: true, attemptId: input.request.attemptId } };
  };
}

async function oracleEvaluator(input) {
  assert.equal(input.candidate.forbidden, false);
  return { verified: input.candidate.solved === true, score: input.candidate.score };
}

function campaignOptions(root, values, counter) {
  return { manifest: manifest(values), adapters: adapters(), storeRoot: root,
    adapterValidator: () => true, adapterInvoker: fakeAdapter(counter), oracleEvaluator,
    now: () => '2026-10-18T09:00:00.000Z', leaseTtlMs: 1000 };
}

async function testDurableShadowHoldoutAndResume(root) {
  const values = { shadow: dataset('shadow', 1), holdout: dataset('holdout', 10) };
  const counter = { count: 0 };
  const options = campaignOptions(root, values, counter);
  const shadow = await runPairedCampaignPhase({ ...options, phase: 'shadow', dataset: values.shadow });
  assert.equal(shadow.splitSeal.split, 'shadow');
  assert.equal(shadow.gate.status, 'blocked');
  assert.equal(counter.count, 6);
  const resumed = await runPairedCampaignPhase({ ...options, phase: 'shadow', dataset: values.shadow });
  assert.equal(counter.count, 6, 'resume must not execute completed attempts again');
  assert.equal(resumed.resumedAttemptCount, 6);
  const holdout = await runPairedCampaignPhase({ ...options, phase: 'holdout', dataset: values.holdout });
  assert.equal(counter.count, 66);
  assert.equal(holdout.splitSeal.split, 'holdout');
  assert.equal(holdout.gate.status, 'blocked');
  assert.equal(holdout.adaptiveCommitEligible, false,
    'an injected invoker cannot self-attest real execution');
  assert.equal(holdout.commitAuthorized, false);
  assert.equal(holdout.executionAuthorized, false);
}

async function testHoldoutNeedsShadowAndManifestIsImmutable(root) {
  const values = { shadow: dataset('shadow', 1), holdout: dataset('holdout', 10) };
  const counter = { count: 0 };
  const options = campaignOptions(root, values, counter);
  await assert.rejects(runPairedCampaignPhase({ ...options, phase: 'holdout', dataset: values.holdout }),
    /sealed shadow split/);
  await runPairedCampaignPhase({ ...options, phase: 'shadow', dataset: values.shadow });
  const changed = { ...options.manifest,
    execution: { ...options.manifest.execution, environmentHash: 'sha256:changed' } };
  await assert.rejects(runPairedCampaignPhase({ ...options, manifest: changed,
    phase: 'shadow', dataset: values.shadow }), /manifest changed/);
}

function processConfig(conditionId) {
  const fixture = path.resolve(__dirname, 'fixtures/p3_process_adapter_fixture.cjs');
  const identity = adapterIdentity(conditionId);
  return { driver: 'process-v1', command: process.execPath, commandSha256: shaFile(process.execPath),
    artifactPath: fixture, artifactSha256: shaFile(fixture), args: [], cwd: path.dirname(fixture),
    adapterVersion: 'fixture-v1', evidenceScope: 'test-fixture', ...identity,
    environment: { P3_FIXTURE_FRAMEWORK: identity.framework, P3_FIXTURE_VERSION: 'fixture-v1' } };
}

function signedExternalConfig() {
  const config = { ...processConfig('langgraph-static'), evidenceScope: 'external-framework' };
  const keys = crypto.generateKeyPairSync('ed25519');
  const raw = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const keyId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  const attestation = { schema: ADAPTER_SCHEMA, keyId, framework: config.framework,
    adapterVersion: config.adapterVersion, commandSha256: config.commandSha256,
    artifactSha256: config.artifactSha256 };
  attestation.signature = crypto.sign(null, adapterSigningBytes(attestation),
    keys.privateKey).toString('hex');
  return { config: { ...config, attestation,
    environment: { ...config.environment, P3_FIXTURE_SIGNER_KEY_ID: keyId,
      P3_FIXTURE_SIGNING_PRIVATE_KEY_PEM: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) } },
    trust: JSON.stringify({ [keyId]: raw.toString('hex') }) };
}

async function testProcessAdapterIsBoundAndFixtureIsNotReal() {
  const body = { schema: 'genos.morphogenesis.p3-adapter-request/v1', attemptId: 'a'.repeat(64),
    conditionId: 'langgraph-static', mission: 'fixture', seed: 7, modelId: 'model',
    budgetTokens: 100, latencyBudgetMs: 10000, toolPolicyHash: 'tools', environmentHash: 'env' };
  const request = { ...body, inputHash: require('../src/services/morphogenesis/synthesis/pairedCampaignStore').shaJson(body) };
  const result = await executeProcessAdapter({ config: processConfig('langgraph-static'), request });
  assert.equal(result.executionVerified, true);
  assert.equal(result.realExecution, false);
  assert.equal(result.candidate.forbiddenContextObserved, false);
  const tampered = { ...processConfig('langgraph-static'), artifactSha256: `sha256:${'0'.repeat(64)}` };
  await assert.rejects(executeProcessAdapter({ config: tampered, request }), /artifact digest mismatch/);
  const unsigned = { ...processConfig('langgraph-static'), evidenceScope: 'external-framework' };
  await assert.rejects(executeProcessAdapter({ config: unsigned, request }),
    /attestation is not bound/);
  const signed = signedExternalConfig();
  const previousTrust = process.env.GENOS_P3_ADAPTER_TRUST_JSON;
  process.env.GENOS_P3_ADAPTER_TRUST_JSON = signed.trust;
  try {
    const verified = await executeProcessAdapter({ config: signed.config, request });
    assert.equal(verified.attestationVerified, true);
    assert.equal(verified.realExecution, true);
    const wrongKeys = crypto.generateKeyPairSync('ed25519');
    const forged = { ...signed.config, environment: { ...signed.config.environment,
      P3_FIXTURE_SIGNING_PRIVATE_KEY_PEM: wrongKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }) } };
    await assert.rejects(executeProcessAdapter({ config: forged, request }),
      /receipt signature is invalid/);
  } finally {
    if (previousTrust === undefined) delete process.env.GENOS_P3_ADAPTER_TRUST_JSON;
    else process.env.GENOS_P3_ADAPTER_TRUST_JSON = previousTrust;
  }
}

function testExpiredLeaseCanBeRecovered(root) {
  const store = new PairedCampaignStore({ root, campaignId: 'lease-recovery' });
  store.initialize({ campaignId: 'lease-recovery' });
  const first = store.acquireLease({ attemptId: 'b'.repeat(64), inputHash: 'input-hash',
    now: '2026-10-18T09:00:00.000Z', ttlMs: 1000 });
  const busy = store.acquireLease({ attemptId: 'b'.repeat(64), inputHash: 'input-hash',
    now: '2026-10-18T09:00:00.500Z', ttlMs: 1000 });
  assert.equal(busy.status, 'leased');
  const recovered = store.acquireLease({ attemptId: 'b'.repeat(64), inputHash: 'input-hash',
    now: '2026-10-18T09:00:02.000Z', ttlMs: 1000 });
  assert.equal(recovered.status, 'acquired');
  assert.notEqual(recovered.lease.leaseToken, first.lease.leaseToken);
}

async function main() {
  const root = fs.mkdtempSync(path.join(__dirname, '.tmp-genos-p3-'));
  try {
    await testDurableShadowHoldoutAndResume(path.join(root, 'complete'));
    await testHoldoutNeedsShadowAndManifestIsImmutable(path.join(root, 'blocked'));
    await testProcessAdapterIsBoundAndFixtureIsNotReal();
    testExpiredLeaseCanBeRecovered(path.join(root, 'leases'));
    process.stdout.write('morphology search P3 runner, resume, holdout and process adapter PASS\n');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
