'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { EffectGate } = require('../src/services/omegaProtocol/effects');
const f = require('./helpers/omegaEffectFixture');

async function receiptGap(directory) {
  const endpoint = f.resource({ dbPath: path.join(directory, 'resource.sqlite') });
  const dbPath = path.join(directory, 'effects.sqlite');
  let dispatches = 0;
  let now = f.NOW;
  let unavailable = true;
  const options = { dbPath, clock: () => now, dispatch: async value => {
    dispatches += 1;
    await endpoint.execute(value);
    throw new Error('response lost after remote commit');
  }, reconcile: value => {
    if (unavailable) throw new Error('endpoint offline');
    return endpoint.reconcile(value);
  } };
  let gate = f.gate(endpoint, options);
  const request = f.request();
  const query = { effectKey: request.effectKey };
  try {
    await endpoint.bootstrap(f.bootstrap());
    assert.equal((await gate.effect(request)).status, 'effect_outcome_unknown');
    assert.equal(endpoint.effects(f.SCOPE).length, 1);
    assert.equal(endpoint.authority(f.SCOPE).budget.spent, 1);
    gate.close(); gate = f.gate(endpoint, options);
    assert.equal((await gate.effect(request)).status, 'effect_outcome_unknown');
    assert.equal(dispatches, 1);
    assert.equal((await gate.reconcileEffect(query)).status, 'effect_outcome_unknown');
    now = '2026-11-03T10:00:00.000Z';
    unavailable = false;
    const receipt = await gate.reconcileEffect(query);
    assert.equal(receipt.status, 'completed');
    assert.deepEqual(receipt.result, request.candidate);
    assert.deepEqual(await gate.effect(request), receipt);
    assert.equal(dispatches, 1);
    assert.equal(endpoint.effects(f.SCOPE).length, 1);
    assert.deepEqual(endpoint.value({ scope: f.SCOPE, resourceId: request.resourceId, action: request.action }), request.candidate);
    assert.deepEqual(gate.history(query).map(event => event.event),
      ['REQUEST_EFFECT', 'AUTHORIZE_EFFECT', 'DISPATCH_INTENT', 'EFFECT_OUTCOME_UNKNOWN', 'EFFECT_RECEIPT']);
  } finally { gate.close(); endpoint.close(); }
}

async function explicitRetry() {
  const endpoint = f.resource();
  let failBeforeDispatch = true;
  let calls = 0;
  const gate = f.gate(endpoint, { dispatch: value => {
    calls += 1;
    if (failBeforeDispatch) throw new Error('not sent');
    return endpoint.execute(value);
  } });
  const request = f.request();
  const query = { effectKey: request.effectKey };
  try {
    await endpoint.bootstrap(f.bootstrap());
    await gate.effect(request);
    await assert.rejects(gate.retryEffect(query), /NOT_APPLIED attestation/);
    assert.equal((await gate.reconcileEffect(query)).status, 'not_applied');
    assert.equal((await gate.effect(request)).status, 'effect_outcome_unknown');
    assert.equal(calls, 1);
    failBeforeDispatch = false;
    assert.equal((await gate.retryEffect(query)).status, 'completed');
    assert.equal(calls, 2);
    assert.equal(endpoint.effects(f.SCOPE).length, 1);
  } finally { gate.close(); endpoint.close(); }
}

async function bindingAndScope() {
  const endpoint = f.resource();
  const gate = f.gate(endpoint);
  const request = f.request();
  try {
    await endpoint.bootstrap(f.bootstrap());
    const first = await gate.effect(request);
    assert.deepEqual(await endpoint.execute(request), first);
    const candidate = { substituted: true };
    await assert.rejects(gate.effect({ ...request, candidate, candidateDigest: digest(candidate) }), /idempotency conflict/);
    await assert.rejects(endpoint.execute({ ...request, candidate, candidateDigest: digest(candidate) }), /effect key conflict/);
    await assert.rejects(gate.effect({ ...request, candidate }), /candidate or key mismatch/);
    const other = f.request({ missionId: 'another-mission' });
    assert.notEqual(other.effectKey, request.effectKey);
    assert.equal((await gate.effect(other)).status, 'completed');
    assert.equal(endpoint.effects(f.SCOPE).length, 2);
    const foreign = f.request({ scope: { ...f.SCOPE, projectId: 'foreign' } });
    assert.equal((await gate.effect(foreign)).status, 'effect_outcome_unknown');
    assert.equal(endpoint.effects(f.SCOPE).length, 2);
  } finally { gate.close(); endpoint.close(); }
}

async function staleAuthorityAndTariff() {
  const endpoint = f.resource();
  const request = f.request();
  try {
    await endpoint.bootstrap(f.bootstrap());
    await assert.rejects(endpoint.execute({ ...request, cost: 0 }), /tariff mismatch/);
    await assert.rejects(endpoint.execute({ ...request, budget: { ...f.BUDGET, limit: 1000 } }), /budget allocation mismatch/);
    await assert.rejects(endpoint.execute({ ...request, expiresAt: '2026-11-01T00:00:00Z' }), /expired/);
    const nextActor = { ...f.ACTOR, incarnationId: 'executor-2' };
    await endpoint.fenceAuthority({ scope: f.SCOPE, previousActor: f.ACTOR, previousAuthority: f.AUTHORITY,
      actor: nextActor, authority: { ...f.AUTHORITY, generation: 2 } });
    await assert.rejects(endpoint.execute(request), /stale actor or authority/);
    assert.equal(endpoint.effects(f.SCOPE).length, 0);
    assert.equal(endpoint.authority(f.SCOPE).budget.spent, 0);
  } finally { endpoint.close(); }
}

async function atomicReceiver() {
  const endpoint = f.resource();
  try {
    await endpoint.bootstrap(f.bootstrap());
    endpoint.store.db.exec(`CREATE TEMP TRIGGER reject_effect BEFORE INSERT ON omega_resource_effects
      BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;`);
    await assert.rejects(endpoint.execute(f.request()), /injected receipt failure/);
    assert.equal(endpoint.effects(f.SCOPE).length, 0);
    assert.equal(endpoint.authority(f.SCOPE).budget.spent, 0);
    assert.equal(endpoint.value({ scope: f.SCOPE, resourceId: 'protected-output', action: 'write' }), null);
    endpoint.store.db.exec('DROP TRIGGER reject_effect');
    await endpoint.execute(f.request());
    assert.equal(endpoint.effects(f.SCOPE).length, 1);
  } finally { endpoint.close(); }
}

async function run() {
  assert.throws(() => new EffectGate({}), /callback required/);
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'omega-effects-'));
  try {
    await receiptGap(directory);
    await explicitRetry();
    await bindingAndScope();
    await staleAuthorityAndTariff();
    await atomicReceiver();
    console.log('OMEGA durable intent, unknown outcome, reconciliation, scoped dedup and fenced atomic resource: PASS');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
