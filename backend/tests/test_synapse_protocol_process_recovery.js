'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { network } = require('./helpers/synapseProcessNetwork.cjs');
const fixture = require('./helpers/synapseProcessFixtures.cjs');
const transfer = require('./helpers/synapseProcessTransfer.cjs');

async function dictionaryFallback(net) {
  const a = await transfer.offer(net, 'receiver-a', { query: fixture.query('receiver-a'), deltaId: 'delta-a' });
  assert.equal(a.outbox.filter(item => item.type === 'REQUEST_MISSING').length, 0);
  await transfer.apply(net, a, 'dialect');
  const query = fixture.query('receiver-b');
  const changed = await net.nodes['receiver-b'].request('dictionary', query);
  assert.ok(changed.after.version > changed.before.version);
  const b = await transfer.offer(net, 'receiver-b', { query, deltaId: 'delta-b' });
  assert.ok(b.last.payload.missing.includes('dictionary'));
  assert.equal(b.last.payload.canonicalRequested, true);
  assert.deepEqual((await net.nodes['receiver-b'].request('state', query)).value, fixture.BASE);
  const committed = await transfer.interrupted(net, b);
  const receipt = await net.nodes['receiver-b'].request('receipt', transfer.deltaQuery(b));
  assert.equal(receipt.resultDigest, b.plan.delta.targetDigest);
  assert.equal(receipt.generation, 1);
  assert.equal((await net.nodes.source.request('state', query)).generation, 0, 'source journal does not apply its own outgoing delta');
  return { a, b, committed };
}

async function distinctFacts(net, flow) {
  const query = transfer.deltaQuery(flow);
  const subject = await net.nodes[flow.receiver].request('subject', query);
  const ack = dimension => fixture.message('ACK_FACT', { ackId: `fact:${dimension}`,
    deltaId: query.deltaId, deltaDigest: query.deltaDigest, dimension,
    subjectDigest: digest(subject), evidenceRef: `receiver-native:${dimension}` },
  { sender: flow.receiver, receiver: flow.receiver, query: flow.query });
  for (const dimension of ['state_applied', 'independently_verified']) {
    const envelope = ack(dimension);
    const result = await net.nodes[flow.receiver].request('ack', envelope);
    assert.deepEqual(await net.nodes[flow.receiver].request('ack', envelope), result);
    const facts = await net.nodes[flow.receiver].request('facts', query);
    assert.equal(facts.dimensions.state_applied.established, true);
    assert.equal(facts.dimensions.action_observed.established, false);
    assert.equal(facts.dimensions.human_authorized.established, false);
    assert.equal(facts.dimensions.independently_verified.established, dimension === 'independently_verified');
    assert.equal(facts.externalActionsAuthorized, false);
  }
  await assert.rejects(net.nodes[flow.receiver].request('ack', ack('human_authorized')), /evidence source unavailable/);
}

async function staleBaseAndRebase(net, prior) {
  const receiver = 'receiver-b';
  const current = await net.nodes[receiver].request('state', prior.b.query);
  await net.nodes.source.request('replace', { query: prior.b.query, value: current.value });
  const local = { ...current.value, localNote: 'receiver-b reviewed this base' };
  await net.nodes[receiver].request('replace', { query: prior.b.query, value: local });
  const stale = await transfer.offer(net, receiver,
    { query: fixture.query(receiver, 'stale-base'), deltaId: 'delta-b-stale', review: true });
  assert.ok(stale.last.payload.missing.includes('base'));
  assert.equal(stale.last.payload.canonicalRequested, false);
  await transfer.apply(net, stale, 'canonical');
  const unchanged = await net.nodes[receiver].request('state', stale.query);
  assert.deepEqual(unchanged.value, local); assert.equal(unchanged.generation, 2);
  assert.equal(await net.nodes[receiver].request('receipt', transfer.deltaQuery(stale)), null);
  await net.nodes.source.request('replace', { query: stale.query, value: unchanged.value });
  const rebased = await transfer.offer(net, receiver,
    { query: fixture.query(receiver, 'rebased'), deltaId: 'delta-b-rebased', review: true });
  assert.equal(rebased.last.payload.canonicalRequested, true);
  await transfer.apply(net, rebased, 'canonical');
  const result = await net.nodes[receiver].request('state', rebased.query);
  assert.equal(result.generation, 3);
  assert.equal(result.value.localNote, local.localNote);
  assert.equal(result.value.D8.status, 'reevaluated');
  assert.equal(result.stateDigest, rebased.plan.delta.targetDigest);
  await net.nodes[receiver].request('wire', prior.committed.message, fixture.ACTORS.source);
  assert.deepEqual(await net.nodes[receiver].request('state', rebased.query), result);
  assert.equal((await net.nodes['receiver-a'].request('state', prior.a.query)).generation, 1);
  const historical = await net.nodes[receiver].request('facts', transfer.deltaQuery(prior.b));
  assert.equal(historical.currentApplicability, 'not_evaluated');
  assert.ok(historical.receipts.every(receipt => receipt.historicalFactOnly));
}

async function run() {
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'genos-synapse-process-'));
  let net;
  try {
    net = await network(directory);
    assert.equal(new Set(Object.values(net.nodes).map(node => node.pid)).size, 3);
    for (const receiver of ['receiver-a', 'receiver-b']) {
      const query = fixture.query(receiver);
      await net.nodes.source.request('initialize', { query });
      await net.nodes[receiver].request('initialize', { query });
    }
    const prior = await dictionaryFallback(net);
    await distinctFacts(net, prior.b);
    await staleBaseAndRebase(net, prior);
    console.log('SYNAPSE three-process dictionary fallback, durable ACK recovery and explicit base rebase: PASS');
  } finally {
    if (net) await net.stop();
    if (path.dirname(path.resolve(directory)) !== parent) throw new Error('Unsafe SYNAPSE process cleanup.');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
