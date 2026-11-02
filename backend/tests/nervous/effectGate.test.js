'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dispatch } = require('../../src/services/nervous/effectGate');
const { NOW, SCOPE, harness, event } = require('./helpers');

async function proposal(t) {
  const h = await harness(); t.after(() => h.store.close());
  await h.runtime.ingest(event('danger', { eventType: 'AGENT_FAILED' }), SCOPE);
  const row = (await h.store.effects(SCOPE)).find(item => JSON.parse(item.body).action === 'INHIBIT_DISPATCH');
  return { ...h, request: { id: row.id, scope: SCOPE } };
}

function adapters(handler) {
  return { mode: 'guarded', clock: () => NOW, handlers: { INHIBIT_DISPATCH: handler },
    authorize: async p => ({ verdict: 'ALLOW', effectId: p.id, scope: p.scope,
      decisionId: 'gate-decision-1', expiresAt: NOW + 1000 }) };
}

test('default observation mode cannot execute even with an injected handler', async t => {
  const h = await proposal(t);
  let calls = 0;
  const options = adapters(async () => { calls += 1; });
  delete options.mode;
  assert.equal((await dispatch(h.store, h.request, options)).status, 'OBSERVE_ONLY');
  assert.equal(calls, 0);
});

test('guarded mode without explicit authorization is denied', async t => {
  const h = await proposal(t);
  assert.equal((await dispatch(h.store, h.request, { mode: 'guarded', clock: () => NOW })).status, 'DENIED');
});

test('scope mismatch, expired authorization and mismatched effect cannot invoke handler', async t => {
  const h = await proposal(t);
  let calls = 0;
  const options = adapters(async () => { calls += 1; });
  const good = options.authorize;
  options.authorize = async p => ({ ...(await good(p)), scope: { ...SCOPE, projectId: 'other' } });
  assert.equal((await dispatch(h.store, h.request, options)).status, 'DENIED');
  options.authorize = async p => ({ ...(await good(p)), expiresAt: NOW });
  assert.equal((await dispatch(h.store, h.request, options)).status, 'DENIED');
  options.authorize = async p => ({ ...(await good(p)), effectId: 'different' });
  assert.equal((await dispatch(h.store, h.request, options)).status, 'DENIED');
  assert.equal(calls, 0);
});

test('simultaneous consumers claim the proposal once and never assert verification', async t => {
  const h = await proposal(t);
  let calls = 0;
  const options = adapters(async () => { calls += 1; });
  const outcomes = await Promise.all([dispatch(h.store, h.request, options), dispatch(h.store, h.request, options)]);
  assert.equal(calls, 1);
  assert.ok(outcomes.some(item => item.status === 'EXECUTED_UNVERIFIED'));
  assert.equal((await h.store.effect(h.request.id, SCOPE)).status, 'EXECUTED_UNVERIFIED');
});

test('executor failure is uncertain and cannot be retried automatically', async t => {
  const h = await proposal(t);
  let calls = 0;
  const options = adapters(async () => { calls += 1; throw new Error('possibly after effect'); });
  assert.equal((await dispatch(h.store, h.request, options)).status, 'UNCERTAIN');
  assert.equal((await dispatch(h.store, h.request, options)).status, 'UNCERTAIN');
  assert.equal(calls, 1);
});

test('expired reflex cannot run and a claimed effect stays claimed after simulated crash', async t => {
  const h = await proposal(t);
  const options = adapters(async () => assert.fail('must not run'));
  options.clock = () => NOW + 30001;
  assert.equal((await dispatch(h.store, h.request, options)).status, 'EXPIRED');
  await h.store.claim(h.request.id, SCOPE);
  options.clock = () => NOW;
  assert.equal((await dispatch(h.store, h.request, options)).status, 'CLAIMED');
});

test('executor timeout is uncertain, signalled for cancellation and never retried', async t => {
  const h = await proposal(t);
  let calls = 0;
  let aborted = false;
  const options = adapters(async (p, context) => {
    calls += 1;
    context.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(() => {});
  });
  options.timeoutMs = 10;
  assert.equal((await dispatch(h.store, h.request, options)).status, 'UNCERTAIN');
  assert.equal(aborted, true);
  assert.equal((await dispatch(h.store, h.request, options)).status, 'UNCERTAIN');
  assert.equal(calls, 1);
});

test('proposal is immutable and authorization cannot alter its target', async t => {
  const h = await proposal(t);
  const options = adapters(async () => assert.fail('must not run'));
  options.authorize = async p => { p.target = 'privileged-agent'; return { verdict: 'ALLOW' }; };
  assert.equal((await dispatch(h.store, h.request, options)).status, 'DENIED_OR_UNAVAILABLE');
  assert.equal((await h.store.effect(h.request.id, SCOPE)).status, 'PROPOSED');
});

test('authorization expiring while acquiring the claim cannot execute', async t => {
  const h = await proposal(t);
  let now = NOW;
  const claim = h.store.claim.bind(h.store);
  h.store.claim = async (id, scope) => { const result = await claim(id, scope); now += 1001; return result; };
  const options = adapters(async () => assert.fail('must not run'));
  options.clock = () => now;
  assert.equal((await dispatch(h.store, h.request, options)).status, 'EXPIRED');
});
