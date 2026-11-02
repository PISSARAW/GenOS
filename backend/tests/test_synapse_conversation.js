'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const fixture = require('./helpers/synapseConversationFixture');

async function realApplyAndDurableOutbox() {
  const setup = await fixture.setup();
  try {
    assert.equal((await fixture.offer(setup)).status, 'ready');
    const result = await fixture.apply(setup);
    assert.equal(result.status, 'applied');
    assert.deepEqual((await setup.receiver.state(setup.documentQuery)).value, { counter: 1 });
    assert.deepEqual((await setup.source.state(setup.documentQuery)).value, fixture.state());
    assert.deepEqual(await setup.receiver.receipt(setup.deltaQuery), result.receipt);
    assert.equal(await setup.source.receipt(setup.deltaQuery), null);
    const state = await setup.receiver.state(setup.documentQuery);
    assert.equal(state.generation, 1);
    assert.equal(state.stateDigest, setup.delta.targetDigest);
    setup.receiver.close();
    setup.receiver = (await fixture.instance('receiver', path.join(setup.directory, 'receiver.db'))).runtime;
    assert.deepEqual(await setup.receiver.receipt(setup.deltaQuery), result.receipt);
    const outbox = await setup.receiver.outbox(setup.documentQuery);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].type, 'ACK_STATE');
    assert.deepEqual(outbox[0].sender, fixture.actor('receiver'));
    assert.deepEqual(outbox[0].audience, fixture.actor('sender'));
    assert.deepEqual(await setup.receiver.apply(setup.applyMessage), result);
    assert.equal((await setup.receiver.outbox(setup.documentQuery)).length, 1);
    assert.equal((await setup.receiver.state(setup.documentQuery)).generation, 1);
    await setup.source.apply(outbox[0]);
    assert.equal((await setup.source.status(setup.deltaQuery)).status, 'acknowledged');
    assert.equal(await setup.source.receipt(setup.deltaQuery), null);
    await assert.rejects(setup.receiver.apply({ ...setup.applyMessage, operationId: 'conflicting-operation' }), /idempotency conflict/);
  } finally { fixture.cleanup(setup); }
}

async function dictionaryRequiresCanonical() {
  const setup = await fixture.setup();
  try {
    await fixture.changeDictionary(setup);
    const dictionary = await require('../src/services/communication/dialectService').getDialect({ db: setup.receiver.db,
      dialectId: setup.receiverDialectId });
    const offered = await fixture.offer(setup);
    assert.equal(offered.status, 'missing');
    assert.deepEqual(offered.outbound[0].payload.missing, ['dictionary']);
    assert.equal(offered.outbound[0].payload.canonicalRequested, true);
    assert.deepEqual((await setup.receiver.state(setup.documentQuery)).value, fixture.state());
    assert.equal(await setup.receiver.receipt(setup.deltaQuery), null);
    const stillMissing = await fixture.apply(setup);
    assert.equal(stillMissing.status, 'missing');
    const applied = await fixture.apply(setup, { encoding: 'canonical' });
    assert.equal(applied.status, 'applied');
    const current = await require('../src/services/communication/dialectService').getDialect({ db: setup.receiver.db,
      dialectId: setup.receiverDialectId });
    assert.equal(digest(current), digest(dictionary));
    assert.equal((await setup.receiver.state(setup.documentQuery)).generation, 1);
  } finally { fixture.cleanup(setup); }
}

async function baseRequiresExplicitRebase() {
  const setup = await fixture.setup();
  try {
    const changed = { counter: 9, note: 'old' };
    await setup.receiver.replaceState(setup.documentQuery, { value: changed, expectedGeneration: 0 });
    const offered = await fixture.offer(setup);
    assert.equal(offered.status, 'missing');
    assert.ok(offered.outbound[0].payload.missing.includes('base'));
    const rejected = await fixture.apply(setup, { encoding: 'canonical' });
    assert.equal(rejected.status, 'missing');
    assert.deepEqual((await setup.receiver.state(setup.documentQuery)).value, changed);
    assert.equal(await setup.receiver.receipt(setup.deltaQuery), null);
    await setup.source.replaceState(setup.documentQuery, { value: changed, expectedGeneration: 0 });
    const query = { ...setup.documentQuery, conversationId: 'rebased-conversation' };
    assert.deepEqual((await setup.receiver.state(query)).value, changed);
    await assert.rejects(setup.receiver.initialize(query, { value: fixture.state(), generation: 0 }), /already initialized/);
    setup.requestMessage = null;
    const next = await fixture.offer(setup, { query, deltaId: 'rebased-delta', operations: [{ kind: 'put', key: 'counter', value: 10 }] });
    assert.equal(next.status, 'ready');
    const result = await fixture.apply(setup);
    assert.equal(result.status, 'applied');
    assert.deepEqual((await setup.receiver.state(query)).value, { counter: 10, note: 'old' });
    assert.equal((await setup.receiver.state(query)).generation, 2);
  } finally { fixture.cleanup(setup); }
}

async function foreignScopeAndCausality() {
  const setup = await fixture.setup();
  try {
    await fixture.offer(setup);
    const invalid = fixture.message('APPLY_DELTA', { deltaId: setup.delta.deltaId, deltaDigest: digest(setup.delta),
      representation: setup.representation });
    await assert.rejects(setup.receiver.apply(invalid), /causal reference/);
    const foreign = { ...invalid, scope: { ...invalid.scope, projectId: 'foreign' } };
    await assert.rejects(setup.receiver.apply(foreign), /scope or digest mismatch/);
    await assert.rejects(setup.receiver.receipt({ ...setup.deltaQuery, conversationId: 'foreign' }), /scope or digest mismatch/);
    const wrongActor = { ...invalid, causalRefs: [setup.offerMessage.messageId], audience: fixture.actor('other') };
    await assert.rejects(setup.receiver.apply(wrongActor), /audience does not match/);
    const earlyAck = fixture.message('ACK_STATE', { deltaId: setup.delta.deltaId, deltaDigest: digest(setup.delta),
      resultDigest: setup.delta.targetDigest }, { causalRefs: [setup.offerMessage.messageId] });
    await assert.rejects(setup.source.apply(earlyAck), /causal reference/);
  } finally { fixture.cleanup(setup); }
}

async function main() {
  await realApplyAndDurableOutbox();
  await dictionaryRequiresCanonical();
  await baseRequiresExplicitRebase();
  await foreignScopeAndCausality();
  console.log('SYNAPSE actual JSON application, native context fallback and durable outbox passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
