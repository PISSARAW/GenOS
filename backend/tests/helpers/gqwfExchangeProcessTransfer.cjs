'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./gqwfExchangeProcessFixtures.cjs');
const wireBlob = item => ({ hash: item.hash, bytesBase64: item.bytesBase64 });

async function send(net, world, step) {
  const { type, ...extra } = step;
  const state = await net.nodes.receiver.request('describe', fixture.query(world));
  const payload = { worldId: world.worldId, worldDigest: digest(world), ...extra.payload };
  const message = fixture.message(type, payload, { id: extra.id, causes: [state.lastMessageId] });
  const result = await net.nodes.receiver.request('world', message, fixture.PRODUCER);
  assert.deepEqual(await net.nodes.receiver.request('world', message, fixture.PRODUCER), result);
  return result;
}

async function transfer(net, id, interrupt = false) {
  const world = fixture.WORLDS[id].world;
  await net.nodes.producer.request('seed', id);
  const offer = fixture.message('OFFER_WORLD', { world });
  await net.nodes.receiver.request('world', offer, fixture.PRODUCER);
  let needed = await send(net, world, { type: 'NEED_OBJECTS' });
  const initialMissing = needed.objects.length;
  let exported = await net.nodes.producer.request('export', { ...fixture.query(world),
    hashes: needed.objects.map(item => item.hash) }, fixture.RECEIVER);
  if (interrupt) {
    assert.ok(exported.length > 1);
    await net.nodes.receiver.request('armGap', world.worldId);
    const lost = send(net, world, { type: 'TRANSFER', payload: wireBlob(exported[0]), id: 'lost-transfer-ack' }).then(
      () => ({ unexpectedSuccess: true }), error => ({ error: error.message }));
    await net.nodes.receiver.milestone('blob-written-before-ack');
    await net.restartReceiver();
    assert.ok((await lost).error);
    needed = await send(net, world, { type: 'NEED_OBJECTS', id: 'need-after-restart' });
    assert.equal(needed.objects.length, initialMissing - 1);
    exported = await net.nodes.producer.request('export', { ...fixture.query(world),
      hashes: needed.objects.map(item => item.hash) }, fixture.RECEIVER);
  }
  for (const item of exported) await send(net, world, { type: 'TRANSFER', payload: wireBlob(item), id: `${world.worldId}:${item.hash}` });
  const verified = await send(net, world, { type: 'VERIFY_WORLD' });
  assert.equal(verified.status, 'verified');
  const actual = await net.nodes.receiver.request('verified', fixture.query(world));
  assert.deepEqual(actual.qualification.assurance, {
    fileRoot: 'content-addressed', externalInputs: 'declared-only', sandbox: 'not-attested' });
  assert.deepEqual(actual.world.origin, world.origin);
  return { initialMissing, world };
}

module.exports = { transfer };
