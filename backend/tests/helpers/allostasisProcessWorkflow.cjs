'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./allostasisProcessFixtures.cjs');

async function send(net, client, message) {
  await net.nodes[client].request('send', message);
  const result = await net.nodes.regulator.request('wire', message, fixture.ACTORS[client]);
  assert.deepEqual(await net.nodes.regulator.request('wire', message, fixture.ACTORS[client]), result);
  return result;
}

async function prepare(net, client) {
  const plan = await net.nodes.regulator.request('plan', { client, reportId: `report:${client}`,
    forecastId: `forecast:${client}`, amount: fixture.REQUESTED });
  const report = fixture.message('REPORT_STATE', { report: plan.report }, { client });
  await send(net, client, report);
  const forecast = fixture.message('FORECAST_NEED', { forecast: plan.forecast }, { client, causes: [report.messageId] });
  await send(net, client, forecast);
  return { client, plan, forecast };
}

function request(flow, input) {
  return fixture.message('REQUEST_BUDGET', { requestId: input.id, budgetId: fixture.BUDGET,
    unit: fixture.UNIT, amount: input.amount, forecastId: flow.plan.forecast.forecastId,
    forecastDigest: digest(flow.plan.forecast) }, { client: flow.client, causes: [flow.forecast.messageId] });
}

async function drain(net) {
  const outbox = await net.nodes.regulator.request('outbox');
  for (const message of outbox) {
    const client = message.audience.agentId;
    assert.ok(['client-a', 'client-b'].includes(client));
    const recorded = await net.nodes[client].request('receive', message, fixture.ACTORS.regulator);
    assert.deepEqual(await net.nodes[client].request('receive', message, fixture.ACTORS.regulator), recorded);
  }
  return outbox;
}

function invariant(pool) {
  assert.equal(pool.capacity, fixture.CAPACITY); assert.equal(pool.protectedReserve, fixture.RESERVE);
  assert.ok(pool.consumed + pool.held + pool.protectedReserve <= pool.capacity);
  return pool.capacity - pool.protectedReserve - pool.consumed - pool.held;
}

function usageMessage(flow, input) {
  return fixture.message('REPORT_USAGE', { allocationId: flow.query.allocationId,
    allocationDigest: flow.query.allocationDigest, operationId: flow.operationId, receiptId: input.id,
    unit: fixture.UNIT, status: input.known ? 'known' : 'unknown',
    cumulativeAmount: input.known ? flow.providerReceipt.cumulativeAmount : null,
    evidenceRef: flow.providerReceipt.evidenceRef }, { client: flow.client, causes: [flow.grant.messageId] });
}

module.exports = { send, prepare, request, drain, invariant, usageMessage };
