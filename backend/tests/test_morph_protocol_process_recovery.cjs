'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { network } = require('./helpers/morphProcessNetwork.cjs');
const fixture = require('./helpers/morphProcessFixtures.cjs');

const PREPARED = { ...fixture.QUERY, plan: fixture.PLAN };
const FAULTS = ['PROPOSE', 'QUIESCE', 'CHECKPOINT', 'PREPARE', 'READY', 'COMMIT', 'APPLY_PARTIAL', 'FINALIZE'];
const readAction = version => ({ scope: fixture.SCOPE, actor: fixture.WORKERS[0], version,
  operationId: 'known-read', content: { operation: 'read' } });

async function send(net, type, options = {}) {
  const state = await net.coordinator('state');
  const message = fixture.message(type, state, options);
  const result = await net.coordinator('apply', message, message.sender);
  assert.deepEqual(await net.coordinator('apply', message, message.sender), result);
  return result;
}

async function qualification(net) {
  const result = await net.participant('node-one', 'canVerify', { scope: fixture.SCOPE, claimId: 'claim',
    verifierIds: ['a', 'b', 'c'], minimumIndependentGroups: 3 });
  assert.equal(result.allowed, false);
  assert.equal(result.independentGroups, 1);
  assert.equal(result.statisticalIndependence, 'not_established');
}

async function ready(net) {
  for (const participant of fixture.PARTICIPANTS) {
    const receipt = await net.participant(participant.agentId, 'readyReceipt', fixture.QUERY);
    await send(net, 'READY', { sender: participant, payload: { receiptDigest: receipt.receiptDigest } });
  }
  await assert.rejects(net.participant('node-one', 'commit', fixture.QUERY), /decision unknown/);
}

async function partialApplication(net) {
  const receipt = await net.participant('node-one', 'commit', fixture.QUERY);
  assert.equal(receipt.status, 'applied');
  const state = await net.coordinator('state');
  const premature = fixture.message('FINALIZE', state);
  await assert.rejects(net.coordinator('apply', premature), /missing or mismatched/);
  assert.equal((await net.coordinator('state')).status, 'committed');
  await send(net, 'RECOVERY_REQUIRED', { payload: { reason: 'node-two application is not confirmed' } });
  const abort = fixture.message('ABORT', await net.coordinator('state'));
  await assert.rejects(net.coordinator('apply', abort), /cannot abort/);
  assert.equal((await net.coordinator('decision', fixture.QUERY)).decision, 'COMMIT');
}

async function finalizeConcurrently(net) {
  const gate = net.holdDecisions();
  const applying = net.participant('node-two', 'commit', fixture.QUERY);
  await gate.entered;
  const finalMessage = fixture.message('FINALIZE', await net.coordinator('state'));
  const finalizing = net.coordinator('apply', finalMessage);
  gate.release();
  const results = await Promise.allSettled([applying, finalizing]);
  assert.equal(results[0].status, 'fulfilled');
  const final = await net.coordinator('apply', finalMessage);
  assert.equal(final.status, 'finalized');
  assert.deepEqual(await net.coordinator('apply', finalMessage), final);
}

async function phases(net, cut) {
  const steps = {
    PROPOSE: () => send(net, 'PROPOSE'),
    QUIESCE: async () => {
      await send(net, 'QUIESCE');
      await net.all('quiesce', PREPARED);
      await assert.rejects(net.participant('node-one', 'act', readAction(1), fixture.WORKERS[0]), /quiesced/);
    },
    CHECKPOINT: () => send(net, 'CHECKPOINT'),
    PREPARE: async () => { await send(net, 'PREPARE'); await net.all('prepare', PREPARED); },
    READY: () => ready(net),
    COMMIT: async () => {
      await send(net, 'COMMIT');
      assert.equal((await net.coordinator('decision', fixture.QUERY)).decision, 'COMMIT');
    },
    APPLY_PARTIAL: () => partialApplication(net),
    FINALIZE: () => finalizeConcurrently(net),
  };
  for (const name of FAULTS) {
    await steps[name]();
    if (name === cut) await net.restart();
  }
}

async function verifyFinal(net) {
  assert.equal((await net.coordinator('state')).status, 'finalized');
  for (const role of net.roles.slice(1)) {
    const state = await net.participant(role, 'status', { scope: fixture.SCOPE });
    assert.equal(state.version, 2);
    assert.deepEqual(state.snapshot, fixture.TARGET);
    await assert.rejects(net.participant(role, 'act', readAction(1), fixture.WORKERS[0]), /stale organization/);
    await assert.rejects(net.participant(role, 'readMessage', { scope: fixture.SCOPE,
      reader: fixture.WORKERS[3], messageId: 'private-message' }, fixture.WORKERS[3]), /frozen message audience/);
    const metadata = await net.participant(role, 'readMessage', { scope: fixture.SCOPE,
      reader: fixture.WORKERS[0], messageId: 'private-message' }, fixture.WORKERS[0]);
    assert.deepEqual(metadata, fixture.SOURCE.audiences[0]);
  }
  await qualification(net);
}

async function scenario(directory, cut) {
  const net = await network(directory);
  try {
    assert.equal(new Set(Object.values(net.nodes).map(node => node.pid)).size, 3);
    await qualification(net);
    await phases(net, cut);
    await verifyFinal(net);
    return { cut, finalized: true, independenceGroups: 1, frozenAudiencePreserved: true };
  } finally { await net.stop(); }
}

async function abortPrepared(directory) {
  const net = await network(directory);
  try {
    await send(net, 'PROPOSE');
    await send(net, 'QUIESCE');
    await net.all('quiesce', PREPARED);
    await send(net, 'CHECKPOINT');
    await send(net, 'PREPARE');
    await net.all('prepare', PREPARED);
    await send(net, 'ABORT');
    await net.all('abort', fixture.QUERY);
    await net.restart();
    for (const role of net.roles.slice(1)) {
      const state = await net.participant(role, 'status', { scope: fixture.SCOPE });
      assert.equal(state.version, 1);
      assert.deepEqual(state.snapshot, fixture.SOURCE);
      assert.equal(state.phase, 'active');
    }
  } finally { await net.stop(); }
}

async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'genos-morph-process-'));
  try {
    for (const cut of FAULTS) console.log('MORPH process recovery:', JSON.stringify(await scenario(path.join(directory, cut), cut)));
    await abortPrepared(path.join(directory, 'ABORT'));
    console.log('MORPH process campaign: 8 restart boundaries and prepared abort passed.');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
