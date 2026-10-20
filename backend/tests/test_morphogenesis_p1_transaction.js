'use strict';

const assert = require('node:assert/strict');
const { fingerprint } = require('../src/services/stateFingerprint');
const { installTopologyPlugins, PLUGIN_TOPOLOGIES } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const { createTopologyRuntimePort } = require('../src/services/morphogenesis/runtime/topologyRuntimePort');
const { executeTopologyMorphogenesis } = require('../src/services/morphogenesis/runtime/topologyMorphogenesisTransaction');

const VERIFIED = Object.freeze({
  observe: 'verified', quiesce: 'verified', snapshot: 'verified',
  adapt: 'verified', restore: 'verified', finalize: 'verified'
});
const PRODUCER = 'fixture-producer';
const VERIFIER = 'fixture-verifier';
const SNAPSHOT_STATE = Object.freeze({ epoch: 1, members: ['fixture-worker'] });
const SNAPSHOT_HASH = fingerprint(SNAPSHOT_STATE);

function lifecycle(events) {
  return {
    observe: async () => record(events, 'observe', { observed: true }),
    quiesce: async () => record(events, 'quiesce', { quiescent: true }),
    snapshot: async ({ context }) => record(events, 'snapshot', context.invalidSnapshot
      ? { restorable: false }
      : { restorable: true, snapshotId: 'snapshot-1', producerId: PRODUCER,
        state: context.alteredSnapshot ? { ...SNAPSHOT_STATE, epoch: 2 } : SNAPSHOT_STATE,
        hash: SNAPSHOT_HASH }),
    adapt: async ({ context }) => {
      events.push('adapt');
      if (context.failAdapt) throw Object.assign(new Error('adaptation failed'), { code: 'ADAPT_FAILED' });
      return { applied: true };
    },
    restore: async ({ context, restoreAttempt }) => record(events, 'restore', {
      restored: true, idempotent: !(context.nonIdempotent && restoreAttempt === 2),
      snapshotId: 'snapshot-1', hash: context.forgeRestore ? 'forged' : SNAPSHOT_HASH
    }),
    finalize: async () => record(events, 'finalize', { finalized: true })
  };
}

function verifier(input) {
  return { verified: true, verifierId: VERIFIER,
    evidenceRefs: [`proof://independent/${input.stage}`], stage: input.stage };
}

function transactionInput(input = {}) {
  return { producerId: PRODUCER, verifierId: VERIFIER, verify: verifier, ...input };
}

function record(events, name, result) {
  events.push(name);
  return result;
}

function portFor(events) {
  return createTopologyRuntimePort({
    topology: 'trinity', executionKind: 'canonical_service',
    morphogenesis: VERIFIED, lifecycle: lifecycle(events),
    execute: async () => ({ status: 'unused' })
  });
}

async function successfulTransaction() {
  const events = [];
  const receipt = await executeTopologyMorphogenesis(transactionInput({
    transitionId: 'tx-success', port: portFor(events), context: {},
  }));
  assert.equal(receipt.committed, true);
  assert.equal(receipt.status, 'committed');
  assert.deepEqual(events, ['observe', 'quiesce', 'snapshot', 'adapt', 'finalize']);
  assert.deepEqual(receipt.phases.map((item) => item.capability),
    ['observe', 'quiesce', 'snapshot', 'adapt', 'verify', 'finalize']);
}

async function rollbackOnFailure() {
  const events = [];
  const receipt = await executeTopologyMorphogenesis(transactionInput({
    transitionId: 'tx-rollback', port: portFor(events), context: { failAdapt: true },
  }));
  assert.equal(receipt.committed, false);
  assert.equal(receipt.status, 'restored');
  assert.equal(receipt.error.code, 'ADAPT_FAILED');
  assert.equal(receipt.recovery.restored.idempotent, true);
  assert.equal(receipt.recovery.verification.stage, 'restored');
  assert.deepEqual(events, ['observe', 'quiesce', 'snapshot', 'adapt',
    'restore', 'restore', 'finalize']);
}

async function recoveryRequiredOnForgedRestore() {
  const receipt = await executeTopologyMorphogenesis(transactionInput({
    transitionId: 'tx-recovery', port: portFor([]),
    context: { failAdapt: true, forgeRestore: true }
  }));
  assert.equal(receipt.committed, false);
  assert.equal(receipt.status, 'recovery_required');
  assert.equal(receipt.recovery.required, true);
  assert.equal(receipt.recovery.error.code, 'TOPOLOGY_MORPHOGENESIS_RESTORE_UNVERIFIED');
}

async function refuseUnrestorableSnapshotWithoutRestore() {
  const events = [];
  const receipt = await executeTopologyMorphogenesis(transactionInput({
    transitionId: 'tx-unrestorable', port: portFor(events), context: { invalidSnapshot: true },
  }));
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.error.code, 'TOPOLOGY_MORPHOGENESIS_SNAPSHOT_NOT_RESTORABLE');
  assert.deepEqual(events, ['observe', 'quiesce', 'snapshot', 'finalize']);
}

async function refuseAlteredSnapshot() {
  const receipt = await executeTopologyMorphogenesis(transactionInput({
    transitionId: 'tx-altered-snapshot', port: portFor([]), context: { alteredSnapshot: true }
  }));
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.error.code, 'TOPOLOGY_MORPHOGENESIS_SNAPSHOT_NOT_RESTORABLE');
}

async function refuseNonIdempotentRestore() {
  const receipt = await executeTopologyMorphogenesis(transactionInput({
    transitionId: 'tx-non-idempotent', port: portFor([]),
    context: { failAdapt: true, nonIdempotent: true }
  }));
  assert.equal(receipt.status, 'recovery_required');
  assert.equal(receipt.recovery.error.code, 'TOPOLOGY_MORPHOGENESIS_RESTORE_NON_IDEMPOTENT');
  assert.equal(receipt.finalization.finalized, true);
}

async function refuseEightUnqualifiedPlugins() {
  const plugins = new Map();
  installTopologyPlugins({ registerTopology: (name, port) => plugins.set(name, port) });
  for (const topology of PLUGIN_TOPOLOGIES) {
    await assert.rejects(executeTopologyMorphogenesis({
      transitionId: `tx-${topology}`, port: plugins.get(topology), verify: verifier,
      producerId: PRODUCER, verifierId: VERIFIER
    }), (error) => error.code === 'TOPOLOGY_MORPHOGENESIS_LIFECYCLE_UNQUALIFIED');
  }
}

async function refuseNonIndependentVerifier() {
  await assert.rejects(executeTopologyMorphogenesis({
    transitionId: 'tx-self-verified', port: portFor([]), verify: verifier,
    producerId: PRODUCER, verifierId: PRODUCER
  }), { code: 'TOPOLOGY_MORPHOGENESIS_VERIFIER_NOT_INDEPENDENT' });
}

async function refuseDeclaredHandler() {
  const port = createTopologyRuntimePort({
    topology: 'test', executionKind: 'hybrid_adapter',
    morphogenesis: { observe: 'declared' },
    lifecycle: { observe: async () => ({ observed: true }) }, execute: async () => ({})
  });
  assert.equal(port.supports('observe'), true);
  assert.equal(port.qualified('observe'), false);
  await assert.rejects(port.morphogenesis('observe', {}),
    (error) => error.code === 'TOPOLOGY_MORPHOGENESIS_CAPABILITY_UNQUALIFIED');
}

async function run() {
  await successfulTransaction();
  await rollbackOnFailure();
  await recoveryRequiredOnForgedRestore();
  await refuseUnrestorableSnapshotWithoutRestore();
  await refuseAlteredSnapshot();
  await refuseNonIdempotentRestore();
  await refuseEightUnqualifiedPlugins();
  await refuseDeclaredHandler();
  await refuseNonIndependentVerifier();
  console.log('Morphogenesis P1 transactional lifecycle: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
