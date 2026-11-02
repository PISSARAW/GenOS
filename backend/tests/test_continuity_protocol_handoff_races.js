'use strict';

const assert = require('node:assert/strict');
const fixture = require('./helpers/continuityHandoffFixture');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function sealRacesAbort() {
  const entered = deferred();
  const release = deferred();
  const runtime = fixture.runtime({ verifyCheckpoint: async (request) => {
    assert.throws(() => { request.bundle.obligations[0].owner.agentId = 'mutated'; }, TypeError);
    entered.resolve();
    await release.promise;
    return fixture.checkpointReceipt(request);
  } });
  try {
    await fixture.prepare(runtime, 'offered');
    const sealing = runtime.apply(fixture.next(runtime, 'SEAL_CHECKPOINT'));
    await entered.promise;
    const state = runtime.state('transfer:1');
    await runtime.apply(fixture.message('ABORT_HANDOFF', { transferId: state.transferId,
      bundleDigest: state.bundleDigest, reason: 'source cancelled before seal' }, { causalRefs: [state.lastMessageId] }));
    release.resolve();
    await assert.rejects(sealing, /changed concurrently/);
    assert.equal(runtime.state('transfer:1').status, 'aborted');
    assert.equal(runtime.history().length, 2);
  } finally { release.resolve(); runtime.close(); }
}

async function revokedDuringSeal() {
  let granted = true;
  const runtime = fixture.runtime({ authorize: async () => granted, verifyCheckpoint: async (request) => {
    granted = false;
    return fixture.checkpointReceipt(request);
  } });
  try {
    await fixture.prepare(runtime, 'offered');
    await assert.rejects(runtime.apply(fixture.next(runtime, 'SEAL_CHECKPOINT')), /authority rejected or revoked/);
    assert.equal(runtime.state('transfer:1').status, 'offered');
    assert.equal(runtime.history().length, 1);
  } finally { runtime.close(); }
}

async function expiredDuringSeal() {
  let now = fixture.NOW;
  const runtime = fixture.runtime({ clock: () => now, verifyCheckpoint: async (request) => {
    now = '2026-11-04T18:00:00.000Z';
    return fixture.checkpointReceipt(request);
  } });
  try {
    await fixture.prepare(runtime, 'offered');
    await assert.rejects(runtime.apply(fixture.next(runtime, 'SEAL_CHECKPOINT')), /expired/);
    assert.equal(runtime.state('transfer:1').status, 'offered');
  } finally { runtime.close(); }
}

async function revokedAfterAuthorityEffect() {
  let granted = true;
  let calls = 0;
  let committed;
  const runtime = fixture.runtime({ authorize: async () => granted, activateAuthority: async (request) => {
    calls += 1;
    const receipt = fixture.activationReceipt(request);
    if (committed) assert.deepEqual(receipt, committed);
    committed = receipt;
    granted = false;
    return receipt;
  } });
  try {
    await fixture.prepare(runtime);
    const activate = fixture.next(runtime, 'ACTIVATE_SUCCESSOR');
    await assert.rejects(runtime.apply(activate), /authority rejected or revoked/);
    assert.equal(runtime.state('transfer:1').status, 'activation_pending');
    assert.equal(runtime.history().length, 3);
    granted = true;
    runtime.activateAuthority = async (request) => {
      calls += 1;
      assert.deepEqual(fixture.activationReceipt(request), committed);
      return committed;
    };
    await runtime.apply(activate);
    assert.equal(runtime.state('transfer:1').status, 'activated');
    assert.equal(calls, 2);
  } finally { runtime.close(); }
}

async function foreignActivationReceipt() {
  const runtime = fixture.runtime({ activateAuthority: async (request) =>
    fixture.activationReceipt({ ...request, scope: { ...request.scope, projectId: 'foreign' } }) });
  try {
    await fixture.prepare(runtime);
    await assert.rejects(runtime.apply(fixture.next(runtime, 'ACTIVATE_SUCCESSOR')), /activation receipt mismatch/);
    assert.equal(runtime.state('transfer:1').status, 'activation_pending');
    assert.equal(runtime.history().length, 3);
  } finally { runtime.close(); }
}

async function main() {
  await sealRacesAbort();
  await revokedDuringSeal();
  await expiredDuringSeal();
  await revokedAfterAuthorityEffect();
  await foreignActivationReceipt();
  console.log('CONTINUITY handoff races, authority revocation and receipt binding passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
