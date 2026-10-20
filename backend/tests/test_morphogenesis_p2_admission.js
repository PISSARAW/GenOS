'use strict';

const assert = require('node:assert/strict');
const { fingerprint } = require('../src/services/stateFingerprint');
const { createVariantRegistry } = require('../src/services/morphogenesis/registry/variantRegistry');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { installTopologyPlugins, PLUGIN_TOPOLOGIES } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const { createTopologyRuntimePort } = require('../src/services/morphogenesis/runtime/topologyRuntimePort');
const {
  assessTopologyMorphogenesis, executeQualifiedTopologyMorphogenesis
} = require('../src/services/morphogenesis/runtime/topologyMorphogenesisAdmission');

const VERIFIED_LIFECYCLE = Object.freeze({
  observe: 'verified', quiesce: 'verified', snapshot: 'verified',
  adapt: 'verified', restore: 'verified', finalize: 'verified'
});
const VERIFIED_QUALIFICATION = Object.freeze({
  runtimeBinding: 'verified', persistent: 'verified', snapshotable: 'verified',
  restorable: 'verified', endToEnd: 'verified'
});
const PRODUCER = 'p2-producer';
const VERIFIER = 'p2-verifier';
const SNAPSHOT_STATE = Object.freeze({ generation: 1 });
const SNAPSHOT_HASH = fingerprint(SNAPSHOT_STATE);

function controlledRegistry(overrides = {}) {
  const evidence = Object.fromEntries(Object.keys(VERIFIED_QUALIFICATION)
    .map((dimension) => [dimension, [`proof://test/${dimension}`]]));
  const registry = createVariantRegistry();
  registry.register({
    topology: 'trinity', variantId: 'controlled', maturity: 'implemented',
    qualification: VERIFIED_QUALIFICATION, qualificationEvidence: evidence,
    ...overrides
  });
  return registry;
}

function qualifiedPort(events) {
  const record = (name, receipt) => async () => {
    events.push(name);
    return receipt;
  };
  return createTopologyRuntimePort({
    topology: 'trinity', executionKind: 'canonical_service',
    morphogenesis: VERIFIED_LIFECYCLE,
    lifecycle: {
      observe: record('observe', { observed: true }),
      quiesce: record('quiesce', { quiescent: true }),
      snapshot: record('snapshot', { restorable: true, snapshotId: 'p2-snapshot',
        producerId: PRODUCER, state: SNAPSHOT_STATE, hash: SNAPSHOT_HASH }),
      adapt: record('adapt', { applied: true }),
      restore: record('restore', { restored: true, idempotent: true,
        snapshotId: 'p2-snapshot', hash: SNAPSHOT_HASH }),
      finalize: record('finalize', { finalized: true })
    },
    execute: async () => ({ status: 'unused' })
  });
}

function request(events, overrides = {}) {
  return {
    transitionId: 'p2-qualified-path', port: qualifiedPort(events),
    variantRegistry: controlledRegistry(overrides),
    plan: { selectedTopology: 'trinity', selectedVariant: 'controlled' },
    producerId: PRODUCER, verifierId: VERIFIER,
    verify: async () => ({ verified: true, verifierId: VERIFIER,
      evidenceRefs: ['proof://test/independent'] })
  };
}

async function executeQualifiedPath() {
  const events = [];
  const receipt = await executeQualifiedTopologyMorphogenesis(request(events));
  assert.equal(receipt.committed, true);
  assert.equal(receipt.admission.admitted, true);
  assert.equal(receipt.promotionEligible, false);
  assert.deepEqual(events, ['observe', 'quiesce', 'snapshot', 'adapt', 'finalize']);
}

async function refuseVerifiedStateWithoutEvidence() {
  const events = [];
  await assert.rejects(executeQualifiedTopologyMorphogenesis(request(events, {
    qualificationEvidence: {}
  })), (error) => {
    assert.equal(error.code, 'TOPOLOGY_VARIANT_QUALIFICATION_REQUIRED');
    assert.ok(error.admission.failures.includes('restorable:evidence_missing'));
    return true;
  });
  assert.deepEqual(events, []);
}

async function refuseIdentityMismatch() {
  const events = [];
  const input = request(events);
  input.plan.selectedVariant = 'other';
  await assert.rejects(executeQualifiedTopologyMorphogenesis(input), (error) => {
    assert.ok(error.admission.failures.includes('plan.variant:not_registered'));
    return true;
  });
  assert.deepEqual(events, []);
}

function refuseCurrentCatalogs() {
  const registry = createTopologyRegistry();
  const plugins = new Map();
  installTopologyPlugins({ registerTopology: (name, port) => plugins.set(name, port) });
  for (const topology of PLUGIN_TOPOLOGIES) {
    const admission = assessTopologyMorphogenesis({
      port: plugins.get(topology), variantRegistry: registry.variants,
      plan: { selectedTopology: topology, selectedVariant: 'default' }
    });
    assert.equal(admission.admitted, false, `${topology} must remain fail-closed`);
    assert.ok(admission.failures.some((failure) => failure.endsWith(':not_verified')));
  }
}

async function run() {
  await executeQualifiedPath();
  await refuseVerifiedStateWithoutEvidence();
  await refuseIdentityMismatch();
  refuseCurrentCatalogs();
  console.log('Morphogenesis P2 topology-variant admission: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
