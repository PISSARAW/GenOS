'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const fixture = require('./helpers/continuityHandoffFixture');

async function durableAndIdempotent() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'continuity-handoff-'));
  const options = { dbPath: path.join(directory, 'handoff.db') };
  let runtime = fixture.runtime(options);
  try {
    await fixture.prepare(runtime);
    const activate = fixture.next(runtime, 'ACTIVATE_SUCCESSOR');
    const result = await runtime.apply(activate);
    assert.equal(result.status, 'activated');
    assert.equal(runtime.state('transfer:1').activationReceipt.newGeneration, 2);
    runtime.close();
    runtime = fixture.runtime(options);
    assert.deepEqual(await runtime.apply(activate), result);
    assert.equal(runtime.history().length, 4);
    await assert.rejects(runtime.apply({ ...activate, operationId: 'conflicting-operation' }), /idempotency conflict/);
    const state = runtime.state('transfer:1');
    assert.deepEqual(state.bundle.obligations[0].owner, fixture.actor(fixture.successor));
    assert.deepEqual(state.acceptedResponsibility.successor, fixture.actor(fixture.successor));
    assert.equal(state.bundle.unknownEffects[0].reference, 'operation:unknown');
    assert.deepEqual(state.bundle.budget, fixture.bundle().budget);
  } finally { runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function crashAfterAuthorityCommit() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'continuity-recovery-'));
  const dbPath = path.join(directory, 'handoff.db');
  const committed = new Map();
  let loseResponse = true;
  const activateAuthority = async (request) => {
    const prior = committed.get(request.transferId);
    if (prior) assert.deepEqual(prior, fixture.activationReceipt(request));
    else committed.set(request.transferId, fixture.activationReceipt(request));
    if (loseResponse) { loseResponse = false; throw new Error('response lost after authority commit'); }
    return committed.get(request.transferId);
  };
  let runtime = fixture.runtime({ dbPath, activateAuthority });
  try {
    await fixture.prepare(runtime);
    const activate = fixture.next(runtime, 'ACTIVATE_SUCCESSOR');
    await assert.rejects(runtime.apply(activate), /response lost/);
    assert.equal(runtime.state('transfer:1').status, 'activation_pending');
    assert.equal(runtime.history().length, 3);
    await assert.rejects(runtime.apply({ ...activate, operationId: 'pending-conflict' }), /pending idempotency conflict/);
    const state = runtime.state('transfer:1');
    const abort = fixture.message('ABORT_HANDOFF', { transferId: state.transferId,
      bundleDigest: state.bundleDigest, reason: 'unsafe rollback' }, { causalRefs: [state.lastMessageId] });
    await assert.rejects(runtime.apply(abort), /cannot abort/);
    runtime.close();
    runtime = fixture.runtime({ dbPath, activateAuthority });
    const result = await runtime.apply(activate);
    assert.equal(result.status, 'activated');
    assert.equal(committed.size, 1);
    assert.equal(runtime.history().length, 4);
  } finally { runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function ownershipAndBinding() {
  const runtime = fixture.runtime();
  try {
    await fixture.prepare(runtime, 'offered');
    await assert.rejects(runtime.apply(fixture.next(runtime, 'ACCEPT_RESPONSIBILITY')), /sealed checkpoint/);
    const seal = fixture.next(runtime, 'SEAL_CHECKPOINT');
    const foreign = fixture.message('SEAL_CHECKPOINT', seal.payload,
      { causalRefs: seal.causalRefs, scope: { ...fixture.scope, projectId: 'foreign' } });
    await assert.rejects(runtime.apply(foreign), /context mismatch/);
    await runtime.apply(seal);
    const accept = fixture.next(runtime, 'ACCEPT_RESPONSIBILITY');
    const wrongActor = { ...accept, sender: fixture.actor(fixture.source) };
    await assert.rejects(runtime.apply(wrongActor), /actor or audience mismatch/);
    const changedBundle = fixture.message('ACCEPT_RESPONSIBILITY', { ...accept.payload, bundleDigest: digest('other') },
      { causalRefs: accept.causalRefs });
    await assert.rejects(runtime.apply(changedBundle), /bundle digest mismatch/);
    await runtime.apply(accept);
    await assert.rejects(runtime.apply(fixture.next(runtime, 'ACTIVATE_SUCCESSOR',
      { generations: { incarnation: 3, organization: 1, workspace: 1 } })), /stale successor/);
  } finally { runtime.close(); }
}

async function invalidOffers() {
  const runtime = fixture.runtime();
  try {
    const foreignBranch = fixture.offer({ successor: { ...fixture.successor, branchId: 'forked-branch' } });
    await assert.rejects(runtime.apply(fixture.message('OFFER_HANDOFF', foreignBranch)), /cross-branch/);
    const restoredHistory = fixture.bundle({ checkpoint: { ...fixture.bundle().checkpoint, sourceHistoryDigest: digest('stale') } });
    await assert.rejects(runtime.apply(fixture.message('OFFER_HANDOFF', fixture.offer({ bundle: restoredHistory }))), /checkpoint history/);
    const unassigned = fixture.bundle({ obligations: [{ obligationId: 'obligation:1', owner: fixture.actor(fixture.source), evidenceRefs: [] }] });
    await assert.rejects(runtime.apply(fixture.message('OFFER_HANDOFF', fixture.offer({ bundle: unassigned }))), /responsibility assignment/);
    const budget = fixture.bundle({ budget: { unit: 'tokens', limit: 10, spent: 9, reserved: 2 } });
    await assert.rejects(async () => runtime.apply(fixture.message('OFFER_HANDOFF', fixture.offer({ bundle: budget }))), /budget exceeds/);
    const authority = { previousGeneration: 1, newGeneration: 3 };
    await assert.rejects(runtime.apply(fixture.message('OFFER_HANDOFF', fixture.offer({ authority }))), /advance exactly once/);
    assert.equal(runtime.history().length, 0);
  } finally { runtime.close(); }
}

async function checkpointReplayRejected() {
  const runtime = fixture.runtime({ verifyCheckpoint: async (request) => ({ ...fixture.checkpointReceipt(request),
    requestDigest: digest({ ...request, scope: { ...request.scope, projectId: 'foreign' } }) }) });
  try {
    await fixture.prepare(runtime, 'offered');
    await assert.rejects(runtime.apply(fixture.next(runtime, 'SEAL_CHECKPOINT')), /checkpoint receipt mismatch/);
    assert.equal(runtime.state('transfer:1').status, 'offered');
    assert.equal(runtime.history().length, 1);
  } finally { runtime.close(); }
}

async function main() {
  await durableAndIdempotent();
  await crashAfterAuthorityCommit();
  await ownershipAndBinding();
  await invalidOffers();
  await checkpointReplayRejected();
  console.log('CONTINUITY durable handoff, responsibility and recovery passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
