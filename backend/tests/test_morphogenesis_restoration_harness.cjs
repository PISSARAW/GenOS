'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fingerprint } = require('../src/services/stateFingerprint');
const { createVariantRegistry } = require('../src/services/morphogenesis/registry/variantRegistry');
const { createTopologyRuntimePort } = require('../src/services/morphogenesis/runtime/topologyRuntimePort');
const { PLUGIN_TOPOLOGIES } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const qualification = require('../src/services/morphogenesis/runtime/topologyMorphogenesisQualification');
const { runMorphogenesisRestorationHarness } = require('./helpers/morphogenesisRestorationHarness.cjs');

const NOW = '2026-10-20T12:00:00.000Z';
const TOPOLOGY = 'qualification_fixture';
const VARIANT = 'transactional';
const PRODUCER = 'fixture-snapshot-producer';
const VERIFIER = 'fixture-state-verifier';
const DIMENSIONS = ['runtimeBinding', 'persistent', 'snapshotable', 'restorable', 'endToEnd'];
const LIFECYCLE = Object.freeze({ observe: 'verified', quiesce: 'verified',
  snapshot: 'verified', adapt: 'verified', restore: 'verified', finalize: 'verified' });
const STATE = Object.freeze({ epoch: 7, members: ['worker-a'] });
const STATE_HASH = fingerprint(STATE);
let evidenceRoot;

function registry() {
  const variants = createVariantRegistry();
  variants.register({ topology: TOPOLOGY, variantId: VARIANT, maturity: 'implemented',
    qualification: Object.fromEntries(DIMENSIONS.map((key) => [key, 'verified'])),
    qualificationEvidence: Object.fromEntries(DIMENSIONS.map((key) =>
      [key, [`proof://fixture/${key}`]])) });
  return variants;
}

function port(events, options = {}) {
  const snapshotState = options.alteredSnapshot ? { ...STATE, epoch: 8 } : STATE;
  return createTopologyRuntimePort({ topology: TOPOLOGY,
    executionKind: options.executionKind || 'canonical_service', morphogenesis: LIFECYCLE,
    lifecycle: {
      observe: async () => record(events, 'observe', { observed: true }),
      quiesce: async () => record(events, 'quiesce', { quiescent: true }),
      snapshot: async () => record(events, 'snapshot', options.incompleteSnapshot
        ? { restorable: true, snapshotId: 'fixture-snapshot' }
        : { restorable: true, snapshotId: 'fixture-snapshot', producerId: PRODUCER,
          state: snapshotState, hash: STATE_HASH }),
      adapt: async () => adapt(events, options),
      restore: async ({ restoreAttempt }) => record(events, `restore:${restoreAttempt}`, {
        restored: true, idempotent: !(options.nonIdempotent && restoreAttempt === 2),
        snapshotId: 'fixture-snapshot', hash: STATE_HASH }),
      finalize: async () => record(events, 'finalize', { finalized: true })
    }, execute: async () => ({ status: 'unused' }) });
}

function adapt(events, options) {
  events.push('adapt');
  if (options.crashCode) throw Object.assign(new Error('simulated phase crash'),
    { code: options.crashCode });
  return { applied: true };
}

function record(events, name, result) { events.push(name); return result; }

function verifier(options = {}) {
  return async (input) => ({ verified: !(options.refuseRestored && input.stage === 'restored'),
    verifierId: VERIFIER, stage: input.stage,
    evidenceRefs: [`proof://fixture/independent/${input.stage}`] });
}

function authority() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  return { issuer: { id: 'fixture-authority', privateKey: keys.privateKey },
    trust: { schema: qualification.TRUST_SCHEMA, authorities: [{
      id: 'fixture-authority', status: 'active', publicKey }] } };
}

function baseInput(name, options = {}) {
  const events = [];
  return { events, transitionId: `fixture-${name}`, port: port(events, options),
    variantRegistry: registry(), plan: { selectedTopology: TOPOLOGY, selectedVariant: VARIANT },
    producerId: options.sameActor ? PRODUCER : PRODUCER,
    verifierId: options.sameActor ? PRODUCER : VERIFIER,
    verify: verifier(options), now: NOW, repositoryRoot: evidenceRoot,
    evidenceFile: path.join(evidenceRoot, `${name}.json`),
    evidenceNow: () => Date.parse(NOW),
    evidenceDependencies: { gitMetadata: () => ({ sha: 'fixture-sha', dirty: false,
      status: [], observed: true }) },
    env: { GENOS_QUALIFICATION_SEED: 'seed-6',
      GENOS_QUALIFICATION_PROVIDER: 'fixture-provider',
      GENOS_QUALIFICATION_BUDGETS_JSON: '{"transitions":1}' } };
}

function attest(input, auth = authority()) {
  const qualificationLease = qualification.issueQualificationLease({ ...input,
    issuer: auth.issuer, ttlMs: 60000 });
  return { ...input, qualificationLease, qualificationTrustRegistry: auth.trust,
    qualificationRevocationLedger: { schema: qualification.LEDGER_SCHEMA, revocations: [] } };
}

async function runCase(name, options = {}) {
  const input = attest(baseInput(name, options));
  return { input, result: await runMorphogenesisRestorationHarness(input) };
}

function verifyDossier(result, verdict) {
  assert.equal(result.dossier.schema, 'genos.qualification-evidence-bundle/v1');
  assert.equal(result.dossier.verdict, verdict);
  assert.equal(result.dossier.terminal, true);
  assert.equal(result.dossier.promotionEligible, false);
  assert.equal(result.dossier.revision.sha, 'fixture-sha');
  assert.equal(result.dossier.experiment.seed, 'seed-6');
  assert.equal(fs.existsSync(result.evidencePath), true);
}

async function commitsTransactionalCycle() {
  const { input, result } = await runCase('success');
  assert.equal(result.receipt.committed, true);
  assert.equal(result.receipt.promotionEligible, false);
  assert.deepEqual(input.events, ['observe', 'quiesce', 'snapshot', 'adapt', 'finalize']);
  assert.ok(result.receipt.phases.some((phase) => phase.capability === 'verify'));
  verifyDossier(result, 'qualified');
}

async function restoresAfterCrash() {
  const { input, result } = await runCase('crash', { crashCode: 'SIMULATED_CRASH' });
  assert.equal(result.receipt.status, 'restored');
  assert.equal(result.receipt.recovery.verification.stage, 'restored');
  assert.deepEqual(input.events, ['observe', 'quiesce', 'snapshot', 'adapt',
    'restore:1', 'restore:2', 'finalize']);
  verifyDossier(result, 'failed');
}

async function refusesSnapshots() {
  for (const [name, options] of [['incomplete', { incompleteSnapshot: true }],
    ['altered', { alteredSnapshot: true }]]) {
    const { input, result } = await runCase(name, options);
    assert.equal(result.receipt.status, 'blocked');
    assert.equal(result.receipt.error.code, 'TOPOLOGY_MORPHOGENESIS_SNAPSHOT_NOT_RESTORABLE');
    assert.deepEqual(input.events, ['observe', 'quiesce', 'snapshot', 'finalize']);
    verifyDossier(result, 'failed');
  }
}

async function refusesUnstableRecovery() {
  const { input, result } = await runCase('non-idempotent', {
    crashCode: 'SIMULATED_CRASH', nonIdempotent: true });
  assert.equal(result.receipt.status, 'recovery_required');
  assert.equal(result.receipt.recovery.error.code,
    'TOPOLOGY_MORPHOGENESIS_RESTORE_NON_IDEMPOTENT');
  assert.equal(input.events.at(-1), 'finalize');
  verifyDossier(result, 'failed');

  const refused = await runCase('restore-not-verified', {
    crashCode: 'SIMULATED_CRASH', refuseRestored: true });
  assert.equal(refused.result.receipt.status, 'recovery_required');
  assert.equal(refused.result.receipt.recovery.error.code,
    'TOPOLOGY_MORPHOGENESIS_VERIFICATION_FAILED');
}

async function recordsExpiredLease() {
  const input = attest(baseInput('expired'));
  input.now = input.qualificationLease.expiresAt;
  const result = await runMorphogenesisRestorationHarness(input);
  assert.equal(result.error.code, 'TOPOLOGY_QUALIFICATION_EXPIRED');
  assert.deepEqual(input.events, []);
  verifyDossier(result, 'failed');
}

async function recordsRevokedLease() {
  const auth = authority();
  const input = attest(baseInput('revoked'), auth);
  const entry = qualification.issueQualificationRevocation({ sequence: 1,
    leaseHash: input.qualificationLease.leaseHash, authorityId: auth.issuer.id,
    reason: 'negative evidence', revokedAt: NOW, privateKey: auth.issuer.privateKey });
  input.qualificationRevocationLedger = {
    schema: qualification.LEDGER_SCHEMA, revocations: [entry] };
  const result = await runMorphogenesisRestorationHarness(input);
  assert.equal(result.error.code, 'TOPOLOGY_QUALIFICATION_REVOKED');
  assert.deepEqual(input.events, []);
  verifyDossier(result, 'failed');
}

async function recordsDerivedBindingDrift() {
  const input = attest(baseInput('binding-drift'));
  input.port = port(input.events, { executionKind: 'hybrid_adapter' });
  const result = await runMorphogenesisRestorationHarness(input);
  assert.equal(result.error.code, 'TOPOLOGY_QUALIFICATION_BINDING_MISMATCH');
  assert.deepEqual(input.events, []);
  verifyDossier(result, 'failed');
}

async function refusesSelfVerification() {
  const input = attest(baseInput('same-actor', { sameActor: true }));
  const result = await runMorphogenesisRestorationHarness(input);
  assert.equal(result.error.code, 'TOPOLOGY_MORPHOGENESIS_VERIFIER_NOT_INDEPENDENT');
  assert.equal(result.dossier.actors.independent, false);
  assert.deepEqual(input.events, []);
  verifyDossier(result, 'failed');
}

async function recordsPortTimeout() {
  const { result } = await runCase('timeout', { crashCode: 'ETIMEDOUT' });
  assert.equal(result.receipt.status, 'restored');
  verifyDossier(result, 'inconclusive');
}

async function main() {
  assert.equal(PLUGIN_TOPOLOGIES.includes(TOPOLOGY), false);
  evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-morph-restoration-'));
  try {
    await commitsTransactionalCycle();
    await restoresAfterCrash();
    await refusesSnapshots();
    await refusesUnstableRecovery();
    await recordsExpiredLease();
    await recordsRevokedLease();
    await recordsDerivedBindingDrift();
    await refusesSelfVerification();
    await recordsPortTimeout();
  } finally {
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
  }
  console.log('Morphogenesis restoration harness: transactional negative matrix PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
