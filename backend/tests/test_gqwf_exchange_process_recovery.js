'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { network } = require('./helpers/gqwfExchangeProcessNetwork.cjs');
const { transfer } = require('./helpers/gqwfExchangeProcessTransfer.cjs');
const protocol = require('./helpers/gqwfExchangeProcessCandidate.cjs');
const fixture = require('./helpers/gqwfExchangeProcessFixtures.cjs');

const headQuery = { scope: fixture.SCOPE, name: 'main' };
const head = net => net.nodes.receiver.request('head', headQuery);

async function competingBranches(net, base) {
  const a = await transfer(net, 'a', true);
  const b = await transfer(net, 'b');
  assert.equal((await head(net)).rootHash, base.rootHash);
  const candidates = [fixture.candidate('candidate-a', a.world, { rootHash: base.rootHash, generation: 0 }),
    fixture.candidate('candidate-b', b.world, { rootHash: base.rootHash, generation: 0 })];
  await Promise.all(candidates.map(candidate => protocol.prepare(net, candidate)));
  const race = await protocol.race(net, candidates);
  assert.equal(race.results[0].status, 'fulfilled');
  assert.equal(race.results[1].status, 'rejected');
  assert.match(race.results[1].reason.message, /base changed|conflict|stale/i);
  const current = await head(net);
  assert.equal(current.rootHash, a.world.rootHash); assert.equal(current.generation, 1);
  const receipt = race.results[0].value;
  assert.equal(receipt.externalEffectsAuthorized, false);
  assert.equal(receipt.origin.kind, 'isolated');
  return { oldCommit: race.messages[0], oldReceipt: receipt, current, b: b.world };
}

async function rebase(net, prior) {
  const relabelled = fixture.candidate('candidate-b-relabelled', prior.b, prior.current);
  await protocol.step(net, relabelled, 'OFFER_CANDIDATE');
  await assert.rejects(protocol.step(net, relabelled, 'REQUEST_EVIDENCE'), /not rebased on the actual head/);
  const rebased = await transfer(net, 'rebased');
  assert.equal(rebased.initialMissing, 0, 'all rebased world blobs already exist in receiver CAS');
  const candidate = fixture.candidate('candidate-b-rebased', rebased.world, prior.current);
  await protocol.prepare(net, candidate);
  const committed = await protocol.step(net, candidate, 'COMMIT');
  assert.equal(committed.result.rootHash, rebased.world.rootHash);
  assert.equal(committed.result.generation, 2);
  const probes = await net.nodes.receiver.request('evidence');
  assert.equal(probes.filter(probe => probe.candidateId === candidate.candidateId).length, 3);
  assert.ok(probes.filter(probe => probe.candidateId === candidate.candidateId)
    .every(probe => probe.baseHash === prior.current.rootHash && probe.exitCode === 0));
  return committed;
}

async function persistedReplay(net, prior, committed) {
  await net.restartReceiver();
  const expected = await head(net);
  assert.equal(expected.rootHash, committed.result.rootHash); assert.equal(expected.generation, 2);
  for (const [message, receipt] of [[prior.oldCommit, prior.oldReceipt], [committed.message, committed.result]]) {
    assert.deepEqual(await net.nodes.receiver.request('candidate', message, fixture.PRODUCER), receipt);
    assert.deepEqual(await head(net), expected);
  }
}

async function run() {
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'genos-gqwf-exchange-process-'));
  let net;
  try {
    net = await network(directory);
    assert.notEqual(net.nodes.producer.pid, net.nodes.receiver.pid);
    const base = (await transfer(net, 'base')).world;
    await net.nodes.receiver.request('initialize', { ...headQuery, rootHash: base.rootHash });
    const prior = await competingBranches(net, base);
    const committed = await rebase(net, prior);
    await persistedReplay(net, prior, committed);
    console.log('GQWF Exchange two-process recovery, independent rebase and native promotion: PASS');
  } finally {
    if (net) await net.stop();
    if (path.dirname(path.resolve(directory)) !== parent) throw new Error('Unsafe GQWF process cleanup.');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
