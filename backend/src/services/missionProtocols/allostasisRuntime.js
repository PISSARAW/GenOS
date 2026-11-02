'use strict';

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');
const { digest } = require('../evidenceProtocol/canonical');
const { createMessage } = require('../allostasisProtocol/contract');
const { AllostasisAllocator } = require('../allostasisProtocol/allocator');
const { AllostasisUsage } = require('../allostasisProtocol/usage');
const { ObservationRegistry } = require('../allostasisProtocol/observations');
const context = require('./context');
const source = require('./allostasisSource');

function message(binding, input) {
  const id = input.id || digest([binding.runId, input.type, input.accounting ? randomUUID() : null]);
  const now = new Date().toISOString();
  return createMessage({ messageId: id, idempotencyKey: id, operationId: binding.runId,
    missionId: binding.missionId, conversationId: binding.runId, scope: binding.scope,
    sender: input.sender || binding.actor, audience: input.audience,
    authority: binding.authority, generations: binding.generations, type: input.type,
    createdAt: input.createdAt || now, expiresAt: input.accounting ? new Date(Date.now() + 60000).toISOString() : binding.expiresAt,
    causalRefs: input.causes || [], payload: input.payload });
}

async function accountingAuthority(binding) {
  const saved = await require('../missionEnvelopeAuthority').read(binding.db, binding.runId);
  if (!saved || saved.envelope.identity.agentId !== binding.agentId
    || saved.envelope.missionId !== binding.missionId) throw new Error('ALLOSTASIS accounting authority mismatch.');
}

function open(binding, actor) {
  const authorize = async ({ operation, request }) => {
    if (['REPORT_USAGE', 'RELEASE', 'PREEMPT', 'USAGE_STATE'].includes(operation)) await accountingAuthority(binding);
    else await context.assertCurrent(binding);
    if (request?.scope && digest(request.scope) !== digest(binding.scope)) return false;
    if (request?.missionId && request.missionId !== binding.missionId) return false;
    return true;
  };
  const allocator = new AllostasisAllocator({ dbPath: path.join(binding.directory, 'allostasis.sqlite'),
    actor, authority: binding.authority, incarnationGeneration: binding.generations.incarnation, authorize,
    observations: db => new ObservationRegistry({ db, authorize,
      qualifyReport: input => source.qualify(binding, input), qualifyForecast: input => source.qualify(binding, input) }),
    verifyRequest: async request => {
      const actual = await source.describe(binding);
      if (request.message.payload.amount !== actual.forecast.amount) throw new Error('ALLOSTASIS request exceeds sealed ordinary ceiling.');
      return { status: 'validated', requestDigest: digest(request), receiptDigest: digest({ request, envelope: actual.report }) };
    } });
  const usage = new AllostasisUsage({ allocator, authorize, verifyUsage: async request => {
    const receipt = allocator.store.raw.prepare('SELECT body FROM mission_time_receipts WHERE id=?').get(request.report.evidenceRef);
    if (!receipt) throw new Error('ALLOSTASIS control plane timing receipt missing.');
    const body = JSON.parse(receipt.body);
    if (digest(body.query) !== digest(request.query) || body.operationId !== request.report.operationId) throw new Error('ALLOSTASIS timing receipt binding mismatch.');
    return { ...body, requestDigest: digest(request), receiptDigest: digest(body), metricId: 'wallTimeMs' };
  } });
  allocator.store.raw.exec(`CREATE TABLE IF NOT EXISTS mission_time_runtime
    (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mission_time_receipts (id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  return { allocator, usage, actor };
}

const pool = binding => ({ scope: binding.scope, missionId: binding.missionId,
  budgetId: binding.runId, unit: 'milliseconds' });

function historical(binding) {
  const filename = path.join(binding.directory, 'allostasis.sqlite');
  if (!fs.existsSync(filename)) return null;
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE name='mission_time_runtime'").get();
    const row = table && db.prepare('SELECT body FROM mission_time_runtime WHERE id=?').get(binding.runId);
    return row ? JSON.parse(row.body) : null;
  } finally { db.close(); }
}

async function admit(binding, runtime) {
  const existing = runtime.allocator.store.raw.prepare('SELECT body FROM mission_time_runtime WHERE id=?').get(binding.runId);
  if (existing) return JSON.parse(existing.body);
  const native = await source.describe(binding);
  if (!await runtime.allocator.pool(pool(binding))) {
    await runtime.allocator.initializePool(pool(binding), { capacity: native.capacity,
      protectedReserve: native.reserve, consumed: 0 });
  }
  const options = { audience: runtime.actor, createdAt: native.report.observedAt };
  const report = message(binding, { ...options, type: 'REPORT_STATE', payload: { report: native.report } });
  await runtime.allocator.apply(report);
  const forecast = message(binding, { ...options, type: 'FORECAST_NEED',
    causes: [report.messageId], payload: { forecast: native.forecast } });
  await runtime.allocator.apply(forecast);
  const granted = await runtime.allocator.apply(message(binding, { ...options, type: 'REQUEST_BUDGET',
    causes: [forecast.messageId], payload: { requestId: `${binding.runId}:time`, budgetId: binding.runId,
      unit: 'milliseconds', amount: native.forecast.amount, forecastId: native.forecast.forecastId,
      forecastDigest: digest(native.forecast) } }));
  if (granted.status !== 'granted') throw new Error('ALLOSTASIS runtime allocation rejected.');
  const body = { query: granted.query, amount: granted.allocation.amount, regulator: runtime.actor };
  runtime.allocator.store.raw.prepare('INSERT INTO mission_time_runtime VALUES(?,?)').run(binding.runId, JSON.stringify(body));
  return body;
}

module.exports = { open, admit, message, pool, accountingAuthority, historical };
