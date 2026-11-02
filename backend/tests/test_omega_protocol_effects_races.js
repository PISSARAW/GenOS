'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { completed } = require('../src/services/omegaProtocol/effectValidation');
const f = require('./helpers/omegaEffectFixture');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function recoveredDispatch(directory) {
  const endpoint = f.resource();
  const observed = deferred();
  const never = new Promise(() => {});
  const dbPath = path.join(directory, 'pending.sqlite');
  let calls = 0;
  let gate = f.gate(endpoint, { dbPath, dispatch: async request => {
    calls += 1;
    await endpoint.execute(request);
    observed.resolve();
    return never;
  } });
  try {
    await endpoint.bootstrap(f.bootstrap());
    gate.effect(f.request()).catch(() => {});
    await observed.promise;
    assert.equal(gate.state({ effectKey: f.request().effectKey }).status, 'dispatching');
    gate.close();
    gate = f.gate(endpoint, { dbPath, dispatch: async () => { calls += 1; throw new Error('unsafe redispatch'); } });
    const query = { effectKey: f.request().effectKey };
    assert.equal(gate.state(query).status, 'effect_outcome_unknown');
    assert.equal((await gate.effect(f.request())).status, 'effect_outcome_unknown');
    assert.equal(calls, 1);
    assert.equal((await gate.reconcileEffect(query)).status, 'completed');
    assert.equal(endpoint.effects(f.SCOPE).length, 1);
    assert.equal(gate.history(query).filter(item => item.event === 'EFFECT_OUTCOME_UNKNOWN').length, 1);
  } finally { gate.close(); endpoint.close(); }
}

async function expiredAndRevokedBeforeDispatch() {
  const endpoint = f.resource();
  let granted = true;
  const revoked = f.gate(endpoint, { authorize: async () => granted, verifyEvidence: async request => {
    assert.throws(() => { request.candidate.result = -1; }, TypeError);
    granted = false;
    return f.proof(request);
  } });
  let now = f.NOW;
  const expired = f.gate(endpoint, { clock: () => now, verifyEvidence: async request => {
    now = '2026-11-02T12:00:00Z';
    return f.proof(request);
  } });
  try {
    await endpoint.bootstrap(f.bootstrap());
    await assert.rejects(revoked.effect(f.request()), /authority rejected or revoked/);
    await assert.rejects(expired.effect(f.request()), /expired/);
    assert.equal(endpoint.effects(f.SCOPE).length, 0);
    assert.equal(revoked.state({ effectKey: f.request().effectKey }).status, 'requested');
  } finally { revoked.close(); expired.close(); endpoint.close(); }
}

async function applicableEvidenceRequired() {
  const endpoint = f.resource();
  const gate = f.gate(endpoint, { verifyEvidence: async request => ({ ...f.proof(request),
    requestDigest: digest({ ...request, baseDigest: digest('another-base') }) }) });
  try {
    await endpoint.bootstrap(f.bootstrap());
    await assert.rejects(gate.effect(f.request()), /evidence binding rejected/);
    assert.equal(endpoint.effects(f.SCOPE).length, 0);
  } finally { gate.close(); endpoint.close(); }
  const denied = f.resource({ verifyEvidence: async () => null });
  try {
    await denied.bootstrap(f.bootstrap());
    await assert.rejects(denied.execute(f.request()), /applicable evidence rejected/);
    assert.equal(denied.effects(f.SCOPE).length, 0);
  } finally { denied.close(); }
}

async function fenceDuringVerification() {
  const entered = deferred();
  const release = deferred();
  const endpoint = f.resource({ verifyEvidence: async request => {
    entered.resolve(); await release.promise; return f.proof(request);
  } });
  try {
    await endpoint.bootstrap(f.bootstrap());
    const pending = endpoint.execute(f.request());
    await entered.promise;
    await endpoint.fenceAuthority({ scope: f.SCOPE, previousActor: f.ACTOR, previousAuthority: f.AUTHORITY,
      actor: { ...f.ACTOR, incarnationId: 'next' }, authority: { ...f.AUTHORITY, generation: 2 } });
    release.resolve();
    await assert.rejects(pending, /stale actor or authority/);
    assert.equal(endpoint.effects(f.SCOPE).length, 0);
  } finally { release.resolve(); endpoint.close(); }
}

async function unboundAndUnknownReceipts() {
  const endpoint = f.resource();
  const request = f.request();
  const gate = f.gate(endpoint, { dispatch: async () => { throw new Error('response lost'); },
    reconcile: async value => completed({ ...value, candidateDigest: digest('foreign-candidate') }, value.candidate) });
  try {
    await endpoint.bootstrap(f.bootstrap());
    await gate.effect(request);
    assert.equal((await gate.reconcileEffect({ effectKey: request.effectKey })).status, 'effect_outcome_unknown');
    gate.reconcile = async () => undefined;
    assert.equal((await gate.reconcileEffect({ effectKey: request.effectKey })).status, 'effect_outcome_unknown');
    gate.reconcile = async value => ({ status: 'not_applied', effectKey: value.effectKey });
    assert.equal((await gate.reconcileEffect({ effectKey: request.effectKey })).status, 'effect_outcome_unknown');
    assert.equal(endpoint.effects(f.SCOPE).length, 0);
  } finally { gate.close(); endpoint.close(); }
}

async function retryAfterExpiryDenied() {
  const endpoint = f.resource();
  let now = f.NOW;
  const gate = f.gate(endpoint, { clock: () => now, dispatch: async () => { throw new Error('never sent'); } });
  const query = { effectKey: f.request().effectKey };
  try {
    await endpoint.bootstrap(f.bootstrap());
    await gate.effect(f.request());
    now = '2026-11-03T00:00:00Z';
    assert.equal((await gate.reconcileEffect(query)).status, 'not_applied');
    await assert.rejects(gate.retryEffect(query), /expired/);
    assert.equal(endpoint.effects(f.SCOPE).length, 0);
  } finally { gate.close(); endpoint.close(); }
}

async function detachedHandlerReceipt() {
  const endpoint = f.resource();
  let handlerReceipt;
  const gate = f.gate(endpoint, { dispatch: async request => {
    handlerReceipt = await endpoint.execute(request);
    return handlerReceipt;
  } });
  try {
    await endpoint.bootstrap(f.bootstrap());
    const receipt = await gate.effect(f.request());
    handlerReceipt.result.result = -999;
    assert.deepEqual(receipt.result, f.request().candidate);
    assert.deepEqual(gate.state({ effectKey: receipt.effectKey }).receipt, receipt);
    assert.deepEqual(endpoint.value({ scope: f.SCOPE, resourceId: 'protected-output', action: 'write' }), receipt.result);
  } finally { gate.close(); endpoint.close(); }
}

async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'omega-effects-races-'));
  try {
    await recoveredDispatch(directory);
    await expiredAndRevokedBeforeDispatch();
    await applicableEvidenceRequired();
    await fenceDuringVerification();
    await unboundAndUnknownReceipts();
    await retryAfterExpiryDenied();
    await detachedHandlerReceipt();
    console.log('OMEGA effect crash recovery, expiry, authority races and fail-closed receipt reconciliation: PASS');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
