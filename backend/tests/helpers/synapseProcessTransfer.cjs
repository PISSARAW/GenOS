'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./synapseProcessFixtures.cjs');

function deltaQuery(flow) {
  const { contextId, ...query } = flow.query;
  return { ...query, deltaId: flow.plan.delta.deltaId, deltaDigest: digest(flow.plan.delta) };
}

async function sourceSend(net, receiver, message) {
  const sent = await net.nodes.source.request('wire', message);
  assert.deepEqual(await net.nodes.source.request('wire', message), sent);
  const result = await net.nodes[receiver].request('wire', message, fixture.ACTORS.source);
  assert.deepEqual(await net.nodes[receiver].request('wire', message, fixture.ACTORS.source), result);
  return result;
}

async function drain(net, receiver, query) {
  const outbox = await net.nodes[receiver].request('outbox', query);
  for (const message of outbox) {
    const result = await net.nodes.source.request('wire', message, fixture.ACTORS[receiver]);
    assert.deepEqual(await net.nodes.source.request('wire', message, fixture.ACTORS[receiver]), result);
  }
  return outbox;
}

async function offer(net, receiver, request) {
  const plan = await net.nodes.source.request('plan', request);
  const options = { receiver, query: request.query };
  const declared = fixture.message('DECLARE_CONTEXT', { context: plan.context }, options);
  await sourceSend(net, receiver, declared);
  const offered = fixture.message('OFFER_DELTA', { delta: plan.delta, representation: plan.dialect },
    { ...options, causes: [declared.messageId] });
  const result = await sourceSend(net, receiver, offered);
  const outbox = await drain(net, receiver, request.query);
  const missing = outbox.filter(message => message.type === 'REQUEST_MISSING');
  return { query: request.query, receiver, plan, result, last: missing.at(-1) || offered, outbox };
}

function application(flow, encoding) {
  return fixture.message('APPLY_DELTA', { deltaId: flow.plan.delta.deltaId, deltaDigest: digest(flow.plan.delta),
    representation: flow.plan[encoding] }, { receiver: flow.receiver, query: flow.query, causes: [flow.last.messageId] });
}

async function apply(net, flow, encoding) {
  const message = application(flow, encoding);
  const result = await sourceSend(net, flow.receiver, message);
  const outbox = await drain(net, flow.receiver, flow.query);
  return { message, result, outbox };
}

async function interrupted(net, flow) {
  const message = application(flow, 'canonical');
  await net.nodes.source.request('wire', message);
  await net.nodes[flow.receiver].request('armGap', flow.plan.delta.deltaId);
  const pending = net.nodes[flow.receiver].request('wire', message, fixture.ACTORS.source)
    .then(value => ({ value }), error => ({ error: error.message }));
  await net.nodes[flow.receiver].milestone('state-committed-before-ack-delivery');
  await net.restart(flow.receiver);
  assert.ok((await pending).error);
  const before = await net.nodes[flow.receiver].request('state', flow.query);
  assert.equal(before.generation, 1);
  assert.equal(before.stateDigest, flow.plan.delta.targetDigest);
  const replay = await net.nodes[flow.receiver].request('wire', message, fixture.ACTORS.source);
  assert.deepEqual(await net.nodes[flow.receiver].request('state', flow.query), before);
  const outbox = await drain(net, flow.receiver, flow.query);
  assert.ok(outbox.some(item => item.type === 'ACK_STATE'));
  return { message, result: replay, outbox };
}

module.exports = { deltaQuery, sourceSend, drain, offer, application, apply, interrupted };
