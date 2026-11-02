'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const fixture = require('./helpers/allostasisProcessFixtures.cjs');
const workflow = require('./helpers/allostasisProcessWorkflow.cjs');
const { network } = require('./helpers/allostasisProcessNetwork.cjs');
const { usageReader } = require('./helpers/allostasisProcessSources.cjs');

async function rejectOtherOperationReceipt(flow) {
  const { receiptDigest, ...original } = flow.providerReceipt;
  const body = { ...original, operationId: 'different-operation' };
  const reader = usageReader(async () => ({ ...body,
    receiptDigest: digest({ profile: 'allostasis-demo-provider/v1', ...body }) }));
  const message = workflow.usageMessage(flow, { id: 'other-operation-probe', known: true });
  await assert.rejects(reader.verifyUsage({ query: flow.query, allocation: flow.grant.payload.allocation,
    report: message.payload }), /allocation or operation mismatch/);
}

async function competingClients(net) {
  const flows = await Promise.all(['client-a', 'client-b'].map(client => workflow.prepare(net, client)));
  const messages = flows.map(flow => workflow.request(flow, { id: `request:${flow.client}`, amount: fixture.REQUESTED }));
  const results = await Promise.all(flows.map((flow, index) => workflow.send(net, flow.client, messages[index])));
  assert.equal(results.filter(result => result.status === 'granted').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const index = results.findIndex(result => result.status === 'granted');
  const outbox = await workflow.drain(net);
  const grant = outbox.find(message => message.type === 'GRANT');
  assert.equal(grant.audience.agentId, flows[index].client);
  const pool = await net.nodes.regulator.request('pool');
  assert.equal(workflow.invariant(pool), 0); assert.equal(pool.held, fixture.REQUESTED);
  const pressure = fixture.message('PRESSURE', { budgetId: fixture.BUDGET, unit: fixture.UNIT, reason: 'more_capacity_needed' }, { client: flows[1 - index].client });
  assert.equal((await workflow.send(net, flows[1 - index].client, pressure)).allocationAuthorized, false);
  assert.deepEqual(await net.nodes.regulator.request('pool'), pool);
  const fake = fixture.message('GRANT', grant.payload, { client: flows[1 - index].client });
  await assert.rejects(workflow.send(net, flows[1 - index].client, fake), /cannot install their own GRANT/);
  return { ...flows[index], query: fixture.allocationQuery(grant), grant, loser: flows[1 - index] };
}

async function unknownAndPreempt(net, flow) {
  flow.operationId = 'measured-wall-time';
  const exposure = await net.nodes.regulator.request('expose', { query: flow.query,
    operationId: flow.operationId, maximumAmount: fixture.REQUESTED, purpose: 'work' });
  assert.equal(exposure.effectDispatched, false);
  flow.providerReceipt = await net.nodes.provider.request('perform', { query: flow.query,
    operationId: flow.operationId, exposure }, fixture.ACTORS.regulator);
  assert.ok(flow.providerReceipt.cumulativeAmount > 0 && flow.providerReceipt.cumulativeAmount < fixture.REQUESTED);
  await rejectOtherOperationReceipt(flow);
  await net.nodes.provider.stop();
  const unknown = workflow.usageMessage(flow, { id: 'usage-unavailable', known: false });
  const reported = await workflow.send(net, flow.client, unknown);
  assert.equal(reported.status, 'usage_unknown'); assert.equal(reported.unknownExposure, fixture.REQUESTED);
  const preempt = fixture.message('PREEMPT', { allocationId: flow.query.allocationId,
    allocationDigest: flow.query.allocationDigest, reason: 'stop_new_work' }, { sender: 'regulator', client: flow.client });
  const closed = await net.nodes.regulator.request('wire', preempt);
  assert.equal(closed.released, 0); assert.equal(closed.held, fixture.REQUESTED);
  await net.nodes[flow.client].request('receive', preempt, fixture.ACTORS.regulator);
  await net.restart('regulator');
  const recovered = await net.nodes.regulator.request('usage', flow.query);
  assert.equal(recovered.allocation.held, fixture.REQUESTED);
  assert.equal(recovered.allocation.unknownExposure, fixture.REQUESTED);
  assert.equal(recovered.allocation.spent, 0);
  assert.deepEqual(await net.nodes.regulator.request('wire', unknown, fixture.ACTORS[flow.client]), reported);
  workflow.invariant(await net.nodes.regulator.request('pool'));
  await assert.rejects(net.nodes.regulator.request('expose', { query: flow.query,
    operationId: 'forbidden-after-preempt', maximumAmount: 1, purpose: 'work' }), /no longer admits work/);
}

async function reconcileAndRelease(net, flow) {
  await net.restart('provider');
  const known = workflow.usageMessage(flow, { id: 'usage-terminal', known: true });
  await net.nodes[flow.client].request('send', known);
  const observed = await net.nodes.regulator.request('reconcile', known, fixture.ACTORS[flow.client]);
  assert.equal(observed.spent, flow.providerReceipt.cumulativeAmount);
  assert.equal(observed.unknownExposure, 0);
  const release = fixture.message('RELEASE', { allocationId: flow.query.allocationId,
    allocationDigest: flow.query.allocationDigest, releaseId: 'release-unused', reason: 'complete',
    evidenceRef: flow.providerReceipt.evidenceRef }, { client: flow.client, causes: [known.messageId] });
  const released = await workflow.send(net, flow.client, release);
  assert.equal(released.spent, flow.providerReceipt.cumulativeAmount);
  assert.equal(released.held, 0);
  const pool = await net.nodes.regulator.request('pool');
  const free = workflow.invariant(pool);
  assert.equal(pool.consumed, flow.providerReceipt.cumulativeAmount);
  assert.equal(free, fixture.REQUESTED - flow.providerReceipt.cumulativeAmount);
  assert.equal(await net.nodes.provider.request('count'), 1);
  const ledger = await net.nodes.regulator.request('ledger');
  assert.equal(ledger.metrics.wallTimeMs.observedValue, pool.consumed);
  assert.equal(ledger.metrics.wallTimeMs.complete, false, 'historical unavailable observation is not erased');
  const denied = workflow.request(flow.loser, { id: 'request-full-again', amount: fixture.REQUESTED });
  assert.equal((await workflow.send(net, flow.loser.client, denied)).status, 'rejected');
  const admitted = workflow.request(flow.loser, { id: 'request-actual-remainder', amount: free });
  assert.equal((await workflow.send(net, flow.loser.client, admitted)).status, 'granted');
  assert.equal(workflow.invariant(await net.nodes.regulator.request('pool')), 0);
  const before = await net.nodes.regulator.request('pool');
  await net.restart('regulator');
  assert.deepEqual(await net.nodes.regulator.request('pool'), before);
  await workflow.drain(net);
}

async function run() {
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'genos-allostasis-process-'));
  let net;
  try {
    net = await network(directory);
    assert.equal(new Set(Object.values(net.nodes).map(node => node.pid)).size, 4);
    await net.nodes.regulator.request('initialize');
    const flow = await competingClients(net);
    await unknownAndPreempt(net, flow);
    await reconcileAndRelease(net, flow);
    console.log('ALLOSTASIE four-process contention, protected reserve, measured usage and unknown recovery: PASS');
  } finally {
    if (net) await net.stop();
    if (path.dirname(path.resolve(directory)) !== parent) throw new Error('Unsafe ALLOSTASIE process cleanup.');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
