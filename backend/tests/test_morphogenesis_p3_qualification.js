'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createVariantRegistry } = require('../src/services/morphogenesis/registry/variantRegistry');
const { createTopologyRuntimePort } = require('../src/services/morphogenesis/runtime/topologyRuntimePort');
const qualification = require('../src/services/morphogenesis/runtime/topologyMorphogenesisQualification');

const NOW = '2026-10-20T10:00:00.000Z';
const VERIFIED = Object.freeze({ observe: 'verified', quiesce: 'verified',
  snapshot: 'verified', adapt: 'verified', restore: 'verified', finalize: 'verified' });
const DIMENSIONS = Object.freeze(['runtimeBinding', 'persistent', 'snapshotable', 'restorable', 'endToEnd']);

function registry(evidenceSuffix = 'v1') {
  const variants = createVariantRegistry();
  variants.register({ topology: 'trinity', variantId: 'controlled',
    qualification: Object.fromEntries(DIMENSIONS.map((key) => [key, 'verified'])),
    qualificationEvidence: Object.fromEntries(DIMENSIONS.map((key) =>
      [key, [`proof://p3/${key}/${evidenceSuffix}`]])) });
  return variants;
}

function port(events, executionKind = 'canonical_service') {
  const record = (name, receipt) => async () => { events.push(name); return receipt; };
  return createTopologyRuntimePort({ topology: 'trinity', executionKind,
    morphogenesis: VERIFIED, lifecycle: {
      observe: record('observe', { observed: true }),
      quiesce: record('quiesce', { quiescent: true }),
      snapshot: record('snapshot', { restorable: true, snapshotId: 'p3-snapshot', hash: 'p3-hash' }),
      adapt: record('adapt', { applied: true }),
      restore: record('restore', { restored: true, verified: true, snapshotId: 'p3-snapshot', hash: 'p3-hash' }),
      finalize: record('finalize', { finalized: true })
    }, execute: async () => ({ status: 'unused' }) });
}

function unwiredPort() {
  return createTopologyRuntimePort({ topology: 'trinity', executionKind: 'canonical_service',
    morphogenesis: VERIFIED, lifecycle: {}, execute: async () => ({ status: 'unused' }) });
}

function authority() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  return { issuer: { id: 'p3-qualification-authority', privateKey: keys.privateKey },
    trust: { schema: qualification.TRUST_SCHEMA, authorities: [{
      id: 'p3-qualification-authority', status: 'active', publicKey
    }] } };
}

function base(events = [], variants = registry(), runtimePort = port(events)) {
  return { transitionId: 'p3-attested-path', port: runtimePort, variantRegistry: variants,
    plan: { selectedTopology: 'trinity', selectedVariant: 'controlled' }, now: NOW,
    verify: async () => ({ verified: true, evidenceRefs: ['proof://p3/independent'] }) };
}

function emptyLedger() {
  return { schema: qualification.LEDGER_SCHEMA, revocations: [] };
}

function issue(input, auth) {
  return qualification.issueQualificationLease({ ...input, issuer: auth.issuer, ttlMs: 60000 });
}

async function executeCurrentLease() {
  const events = [];
  const input = base(events);
  const auth = authority();
  const qualificationLease = issue(input, auth);
  const receipt = await qualification.executeAttestedTopologyMorphogenesis({ ...input,
    qualificationLease, qualificationTrustRegistry: auth.trust,
    qualificationRevocationLedger: emptyLedger() });
  assert.equal(receipt.committed, true);
  assert.equal(receipt.qualification.status, 'current');
  assert.equal(receipt.promotionEligible, false);
  assert.deepEqual(events, ['observe', 'quiesce', 'snapshot', 'adapt', 'finalize']);
}

async function refuseExpiredLease() {
  const events = [];
  const input = base(events);
  const auth = authority();
  const qualificationLease = issue(input, auth);
  await assert.rejects(qualification.executeAttestedTopologyMorphogenesis({ ...input,
    now: qualificationLease.expiresAt, qualificationLease,
    qualificationTrustRegistry: auth.trust, qualificationRevocationLedger: emptyLedger()
  }), { code: 'TOPOLOGY_QUALIFICATION_EXPIRED' });
  assert.deepEqual(events, []);
}

async function refuseRuntimeOrEvidenceDrift() {
  const auth = authority();
  const original = base([]);
  const qualificationLease = issue(original, auth);
  for (const changed of [base([], registry('v2')), base([], registry(), port([], 'hybrid_adapter'))]) {
    await assert.rejects(qualification.executeAttestedTopologyMorphogenesis({ ...changed,
      qualificationLease, qualificationTrustRegistry: auth.trust,
      qualificationRevocationLedger: emptyLedger()
    }), { code: 'TOPOLOGY_QUALIFICATION_BINDING_MISMATCH' });
  }
  await assert.rejects(qualification.executeAttestedTopologyMorphogenesis({
    ...base([], registry(), unwiredPort()), qualificationLease,
    qualificationTrustRegistry: auth.trust, qualificationRevocationLedger: emptyLedger()
  }), { code: 'TOPOLOGY_QUALIFICATION_PORT_UNQUALIFIED' });
}

async function refuseRevokedOrForgedLedger() {
  const events = [];
  const input = base(events);
  const auth = authority();
  const qualificationLease = issue(input, auth);
  const revocation = qualification.issueQualificationRevocation({ sequence: 1,
    leaseHash: qualificationLease.leaseHash, authorityId: auth.issuer.id,
    reason: 'counter-evidence', revokedAt: NOW, privateKey: auth.issuer.privateKey });
  const execute = (entry) => qualification.executeAttestedTopologyMorphogenesis({ ...input,
    qualificationLease, qualificationTrustRegistry: auth.trust,
    qualificationRevocationLedger: { schema: qualification.LEDGER_SCHEMA, revocations: [entry] } });
  await assert.rejects(execute(revocation), { code: 'TOPOLOGY_QUALIFICATION_REVOKED' });
  await assert.rejects(execute({ ...revocation, signature: 'forged' }),
    { code: 'TOPOLOGY_QUALIFICATION_REVOCATION_INVALID' });
  assert.deepEqual(events, []);
}

async function run() {
  await executeCurrentLease();
  await refuseExpiredLease();
  await refuseRuntimeOrEvidenceDrift();
  await refuseRevokedOrForgedLedger();
  console.log('Morphogenesis P3 signed and revocable qualification: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
