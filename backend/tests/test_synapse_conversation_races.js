'use strict';

const assert = require('node:assert/strict');
const { withTransaction } = require('../src/db');
const dialect = require('../src/services/communication/dialectService');
const fixture = require('./helpers/synapseConversationFixture');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function revokedDuringSecondProvider() {
  const setup = await fixture.setup();
  try {
    await fixture.offer(setup);
    let granted = true;
    let reads = 0;
    const local = setup.receiver.localContext;
    setup.receiver.authorize = async () => granted;
    setup.receiver.localContext = async (request) => {
      const result = await local(request);
      reads += 1;
      if (reads === 2) granted = false;
      return result;
    };
    await assert.rejects(fixture.apply(setup), /authority rejected or revoked/);
    assert.equal(reads, 2);
    granted = true;
    assert.deepEqual((await setup.receiver.state(setup.documentQuery)).value, fixture.state());
    assert.equal(await setup.receiver.receipt(setup.deltaQuery), null);
    assert.deepEqual(await setup.receiver.outbox(setup.documentQuery), []);
  } finally { fixture.cleanup(setup); }
}

async function dictionaryDriftDuringFinalAuthorization() {
  const setup = await fixture.setup();
  try {
    await fixture.offer(setup);
    let checks = 0;
    setup.receiver.authorize = async ({ operation, request }) => {
      if (operation === 'APPLY' && request.type === 'APPLY_DELTA') {
        checks += 1;
        if (checks === 3) await fixture.changeDictionary(setup);
      }
      return true;
    };
    const missing = await fixture.apply(setup);
    assert.equal(checks, 3);
    assert.equal(missing.status, 'missing');
    assert.deepEqual(missing.outbound[0].payload.missing, ['dictionary']);
    assert.equal(missing.outbound[0].payload.canonicalRequested, true);
    assert.deepEqual((await setup.receiver.state(setup.documentQuery)).value, fixture.state());
    assert.equal(await setup.receiver.receipt(setup.deltaQuery), null);
  } finally { fixture.cleanup(setup); }
}

async function driftWhileWaitingForMutex() {
  const setup = await fixture.setup();
  const entered = deferred();
  const release = deferred();
  try {
    await fixture.offer(setup);
    const blocker = withTransaction(setup.receiver.db, async () => {
      entered.resolve();
      await release.promise;
      await fixture.changeDictionary(setup);
    });
    await entered.promise;
    const applying = fixture.apply(setup);
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    release.resolve();
    await blocker;
    const result = await applying;
    assert.equal(result.status, 'missing');
    assert.deepEqual(result.outbound[0].payload.missing, ['dictionary']);
    assert.equal((await setup.receiver.state(setup.documentQuery)).generation, 0);
  } finally { release.resolve(); fixture.cleanup(setup); }
}

async function expiryAfterNativeDecode() {
  const setup = await fixture.setup();
  try {
    await fixture.offer(setup);
    const qualify = setup.receiver.codec.qualify.bind(setup.receiver.codec);
    let calls = 0;
    setup.receiver.codec.qualify = async (input) => {
      const result = await qualify(input);
      calls += 1;
      if (calls === 2) setup.receiver.clock = () => '2026-11-03T10:00:00.000Z';
      return result;
    };
    await assert.rejects(fixture.apply(setup), /expired/);
    assert.equal((await setup.receiver.state(setup.documentQuery)).generation, 0);
    assert.equal(await setup.receiver.receipt(setup.deltaQuery), null);
    assert.deepEqual(await setup.receiver.outbox(setup.documentQuery), []);
  } finally { fixture.cleanup(setup); }
}

async function journalFailureRollsBackEverything() {
  const setup = await fixture.setup();
  try {
    await fixture.offer(setup);
    const record = setup.receiver.store.record;
    setup.receiver.store.record = () => { throw new Error('injected journal failure'); };
    await assert.rejects(fixture.apply(setup), /injected journal failure/);
    setup.receiver.store.record = record;
    assert.deepEqual((await setup.receiver.state(setup.documentQuery)).value, fixture.state());
    assert.equal((await setup.receiver.status(setup.deltaQuery)).status, 'ready');
    assert.equal(await setup.receiver.receipt(setup.deltaQuery), null);
    assert.deepEqual(await setup.receiver.outbox(setup.documentQuery), []);
    assert.equal(setup.receiver.store.raw.prepare('SELECT COUNT(*) AS count FROM synapse_document_history').get().count, 1);
    assert.equal((await fixture.apply(setup)).status, 'applied');
  } finally { fixture.cleanup(setup); }
}

async function parallelDuplicateAppliesOnce() {
  const setup = await fixture.setup();
  try {
    await fixture.offer(setup);
    const message = fixture.message('APPLY_DELTA', { deltaId: setup.delta.deltaId,
      deltaDigest: setup.deltaQuery.deltaDigest, representation: setup.representation }, { causalRefs: [setup.offerMessage.messageId] });
    await setup.source.apply(message);
    const [first, second] = await Promise.all([setup.receiver.apply(message), setup.receiver.apply(message)]);
    assert.deepEqual(first, second);
    assert.equal((await setup.receiver.state(setup.documentQuery)).generation, 1);
    assert.equal((await setup.receiver.outbox(setup.documentQuery)).length, 1);
  } finally { fixture.cleanup(setup); }
}

async function nativeGroundInvalidationCannotUseCanonical() {
  const setup = await fixture.setup();
  try {
    await fixture.offer(setup);
    await require('../src/services/communication/commonGroundService').invalidateGround({ db: setup.receiver.db,
      agentA: 'sender', agentB: 'receiver', domain: 'counter',
      semanticFingerprint: fixture.operationConfigurations()[0].semanticFingerprint, status: 'revoked' });
    const result = await fixture.apply(setup, { encoding: 'canonical' });
    assert.equal(result.status, 'missing');
    assert.ok(result.outbound[0].payload.missing.includes('grounding'));
    assert.equal(await setup.receiver.receipt(setup.deltaQuery), null);
    assert.equal((await setup.receiver.state(setup.documentQuery)).generation, 0);
  } finally { fixture.cleanup(setup); }
}

async function main() {
  await revokedDuringSecondProvider();
  await dictionaryDriftDuringFinalAuthorization();
  await driftWhileWaitingForMutex();
  await expiryAfterNativeDecode();
  await journalFailureRollsBackEverything();
  await parallelDuplicateAppliesOnce();
  await nativeGroundInvalidationCannotUseCanonical();
  console.log('SYNAPSE provider revocation, final context drift, mutex, expiry and atomic rollback passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
