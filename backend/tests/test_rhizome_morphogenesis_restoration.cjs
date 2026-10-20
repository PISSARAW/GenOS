'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVariantRegistry } = require('../src/services/morphogenesis/registry/variantRegistry');
const { installTopologyPlugins, PLUGIN_TOPOLOGIES } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const qualification = require('../src/services/morphogenesis/runtime/topologyMorphogenesisQualification');
const restoration = require('../src/services/morphogenesis/runtime/rhizomeRestorationPort');
const { runMorphogenesisRestorationHarness } = require('./helpers/morphogenesisRestorationHarness.cjs');
const fixture = require('./helpers/rhizomeRestorationFixture.cjs');

const ISO_NOW = new Date(fixture.NOW).toISOString();
const DIMENSIONS = ['runtimeBinding', 'persistent', 'snapshotable', 'restorable', 'endToEnd'];
let evidenceRoot;

function registry() {
  const variants = createVariantRegistry();
  variants.register({ topology: 'rhizome', variantId: 'routing', maturity: 'implemented',
    qualification: Object.fromEntries(DIMENSIONS.map((key) => [key, 'verified'])),
    qualificationEvidence: Object.fromEntries(DIMENSIONS.map((key) =>
      [key, [`proof://rhizome-restoration/${key}`]])) });
  return variants;
}

function authority() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  return { issuer: { id: 'rhizome-restoration-authority', privateKey: keys.privateKey },
    trust: { schema: qualification.TRUST_SCHEMA, authorities: [{
      id: 'rhizome-restoration-authority', status: 'active', publicKey }] } };
}

function expectedQuiescentHash() {
  return fixture.snapshotHash({ ...fixture.initialState(), status: 'DORMANT' });
}

function baseInput(name, runtime) {
  const plan = fixture.bindSnapshotHash(fixture.controlledPlan(), expectedQuiescentHash());
  return { transitionId: `rhizome-${name}`, port: runtime.port, variantRegistry: registry(),
    plan: { selectedTopology: 'rhizome', selectedVariant: 'routing', rhizome: plan },
    context: { sessionId: 'rhizome-session-7' }, producerId: fixture.PRODUCER,
    verifierId: fixture.VERIFIER, verify: runtime.verify, now: ISO_NOW,
    repositoryRoot: evidenceRoot, evidenceFile: path.join(evidenceRoot, `${name}.json`),
    evidenceNow: () => fixture.NOW,
    evidenceDependencies: { gitMetadata: () => ({ sha: 'rhizome-fixture-sha',
      dirty: false, status: [], observed: true }) },
    env: { GENOS_QUALIFICATION_SEED: 'rhizome-seed',
      GENOS_QUALIFICATION_PROVIDER: 'injected-rhizome-store',
      GENOS_QUALIFICATION_BUDGETS_JSON: '{"transitions":1}' } };
}

function attest(input, auth = authority()) {
  const qualificationLease = qualification.issueQualificationLease({ ...input,
    issuer: auth.issuer, ttlMs: 60000 });
  return { ...input, qualificationLease, qualificationTrustRegistry: auth.trust,
    qualificationRevocationLedger: { schema: qualification.LEDGER_SCHEMA, revocations: [] } };
}

async function execute(name, options = {}) {
  const runtime = fixture.createFixture(options);
  const input = attest(baseInput(name, runtime));
  if (options.crashAfterAdapt) input.context.crashAfterAdapt = true;
  return { runtime, input, result: await runMorphogenesisRestorationHarness(input) };
}

function verifyDossier(result, verdict) {
  assert.equal(result.dossier.schema, 'genos.qualification-evidence-bundle/v1');
  assert.equal(result.dossier.verdict, verdict);
  assert.equal(result.dossier.terminal, true);
  assert.equal(result.dossier.promotionEligible, false);
  assert.equal(result.dossier.selection.topology, 'rhizome');
  assert.equal(fs.existsSync(result.evidencePath), true);
}

async function nominalCommit() {
  const { runtime, result } = await execute('nominal');
  assert.equal(result.receipt.committed, true);
  assert.equal(result.receipt.promotionEligible, false);
  assert.equal(runtime.state().variant.id, 'exploratory');
  assert.equal(runtime.state().branches.nodes.length, 2);
  assert.deepEqual(runtime.events, ['quiesce', 'adapt', 'finalize']);
  verifyDossier(result, 'qualified');
}

async function crashRestoresExactlyOnce() {
  const { runtime, result } = await execute('crash', { crashAfterAdapt: true });
  assert.equal(result.receipt.committed, false);
  assert.equal(result.receipt.status, 'restored');
  assert.equal(result.receipt.error.code, 'RHIZOME_SIMULATED_POST_ADAPT_CRASH');
  assert.equal(runtime.state().variant.id, 'routing');
  assert.equal(runtime.state().branches.nodes.length, 1);
  assert.equal(runtime.restoreWrites(), 1, 'double restore must perform one durable replacement');
  assert.deepEqual(runtime.events, ['quiesce', 'adapt', 'replace', 'finalize']);
  verifyDossier(result, 'failed');
}

function snapshotProxy(port, mode) {
  return { ...port, morphogenesis: async (capability, request) => {
    const receipt = await port.morphogenesis(capability, request);
    if (capability !== 'snapshot') return receipt;
    if (mode === 'incomplete') {
      const { state: omitted, ...incomplete } = receipt;
      return incomplete;
    }
    return { ...receipt, state: { ...receipt.state,
      checkpoints: { ...receipt.state.checkpoints, graphVersion: 999 } } };
  } };
}

async function refusesInvalidSnapshots() {
  for (const mode of ['incomplete', 'altered']) {
    const runtime = fixture.createFixture();
    runtime.port = snapshotProxy(runtime.port, mode);
    const input = attest(baseInput(`snapshot-${mode}`, runtime));
    const result = await runMorphogenesisRestorationHarness(input);
    assert.equal(result.receipt.status, 'blocked');
    assert.equal(result.receipt.error.code, 'TOPOLOGY_MORPHOGENESIS_SNAPSHOT_NOT_RESTORABLE');
    assert.deepEqual(runtime.events, ['quiesce', 'finalize']);
    verifyDossier(result, 'failed');
  }
}

async function refusesActiveLease() {
  const { runtime, result } = await execute('active-lease', { activeLease: true });
  assert.equal(result.receipt.status, 'blocked');
  assert.equal(result.receipt.error.code, 'RHIZOME_RESTORATION_NOT_QUIESCENT');
  assert.deepEqual(runtime.events, []);
  verifyDossier(result, 'failed');
}

async function detectsExternalDivergence() {
  const { runtime, result } = await execute('external-divergence', { externalDivergence: true });
  assert.equal(result.receipt.status, 'recovery_required');
  assert.equal(result.receipt.error.code, 'TOPOLOGY_MORPHOGENESIS_VERIFICATION_FAILED');
  assert.equal(result.receipt.recovery.error.code, 'TOPOLOGY_MORPHOGENESIS_VERIFICATION_FAILED');
  assert.equal(runtime.restoreWrites(), 1);
  assert.equal(runtime.events.at(-1), 'finalize');
  verifyDossier(result, 'failed');
}

async function refusesSessionBoundVariantTransition() {
  const runtime = fixture.createFixture();
  const input = baseInput('session-bound-variant', runtime);
  input.plan.rhizome.changes.variant = {
    id: 'private', selection: { reason: 'forbidden-in-place' }, policyVersion: 3 };
  const result = await runMorphogenesisRestorationHarness(attest(input));
  assert.equal(result.receipt.status, 'restored');
  assert.equal(result.receipt.error.code, 'RHIZOME_RESTORATION_PLAN_INVALID');
  assert.equal(runtime.restoreWrites(), 0);
  assert.equal(runtime.state().variant.id, 'routing');
  verifyDossier(result, 'failed');
}

async function recordsExpiredLease() {
  const runtime = fixture.createFixture();
  const input = attest(baseInput('expired-lease', runtime));
  input.now = input.qualificationLease.expiresAt;
  const result = await runMorphogenesisRestorationHarness(input);
  assert.equal(result.error.code, 'TOPOLOGY_QUALIFICATION_EXPIRED');
  assert.deepEqual(runtime.events, []);
  verifyDossier(result, 'failed');
}

async function recordsRevokedLease() {
  const runtime = fixture.createFixture();
  const auth = authority();
  const input = attest(baseInput('revoked-lease', runtime), auth);
  const revocation = qualification.issueQualificationRevocation({ sequence: 1,
    leaseHash: input.qualificationLease.leaseHash, authorityId: auth.issuer.id,
    reason: 'rhizome counter-evidence', revokedAt: ISO_NOW,
    privateKey: auth.issuer.privateKey });
  input.qualificationRevocationLedger = {
    schema: qualification.LEDGER_SCHEMA, revocations: [revocation] };
  const result = await runMorphogenesisRestorationHarness(input);
  assert.equal(result.error.code, 'TOPOLOGY_QUALIFICATION_REVOKED');
  assert.deepEqual(runtime.events, []);
  verifyDossier(result, 'failed');
}

function onlyRhizomeCanBeOptInQualified() {
  const runtimeFixture = fixture.createFixture();
  const installed = new Map();
  const runtime = { rhizomeRestoration: { store: runtimeFixture.store,
    producerId: fixture.PRODUCER, qualificationOnly: true, now: () => fixture.NOW },
  registerTopology: (name, port) => installed.set(name, port) };
  installTopologyPlugins(runtime);
  for (const topology of PLUGIN_TOPOLOGIES) {
    const capabilities = ['observe', 'quiesce', 'snapshot', 'adapt', 'restore', 'finalize'];
    const fullyQualified = capabilities.every((capability) => installed.get(topology).qualified(capability));
    assert.equal(fullyQualified, topology === 'rhizome');
  }
}

function refusesProductionAuthority() {
  assert.throws(() => restoration.createRhizomeRestorationPort({
    qualificationOnly: false, producerId: fixture.PRODUCER, store: {}
  }), { code: 'RHIZOME_RESTORATION_PRODUCTION_FORBIDDEN' });
}

async function main() {
  evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-rhizome-restoration-'));
  try {
    await nominalCommit();
    await crashRestoresExactlyOnce();
    await refusesInvalidSnapshots();
    await refusesActiveLease();
    await detectsExternalDivergence();
    await refusesSessionBoundVariantTransition();
    await recordsExpiredLease();
    await recordsRevokedLease();
    onlyRhizomeCanBeOptInQualified();
    refusesProductionAuthority();
  } finally {
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
  }
  console.log('Rhizome morphogenesis restoration: specialized transactional matrix PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
