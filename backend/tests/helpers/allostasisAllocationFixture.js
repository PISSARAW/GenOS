'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { AllostasisAllocator } = require('../../src/services/allostasisProtocol/allocator');
const { ObservationRegistry } = require('../../src/services/allostasisProtocol/observations');
const { createStateQualifier } = require('../../src/services/allostasisProtocol/qualification');
const native = require('./allostasisQualificationFixture');
let sequence = 0;

function message(type, payload, options = {}) {
  sequence += 1;
  return native.message(type, { messageId: `allocation-message:${sequence}`, idempotencyKey: `allocation-key:${sequence}`,
    payload, ...options });
}

async function instance(filename, options = {}) {
  const qualifiers = new Map();
  const candidates = new Map();
  const allocator = new AllostasisAllocator({ dbPath: filename, actor: native.actor('regulator'),
    incarnationGeneration: 1, authority: { authorityId: 'regulator-authority', generation: 1 },
    authorize: async () => true, clock: () => native.NOW,
    verifyRequest: async (request) => ({ status: 'validated', requestDigest: digest(request), receiptDigest: digest('bound-admission') }),
    observations: db => new ObservationRegistry({ db, authorize: async () => true, clock: () => native.NOW,
      qualifyReport: ({ message: frame, report }) => qualifiers.get(frame.sender.agentId).qualifyReport(report),
      qualifyForecast: ({ message: frame, forecast }) => qualifiers.get(frame.sender.agentId).qualifyForecast(forecast) }), ...options });
  await allocator.ready;
  for (const sourceAgentId of ['client-a', 'client-b']) {
    const config = native.configuration(allocator.db, { sourceAgentId });
    candidates.set(sourceAgentId, await native.seedNative(allocator.db, config));
    qualifiers.set(sourceAgentId, createStateQualifier({ ...config, loadCandidate: native.candidateReader(allocator.db, config) }));
  }
  return { allocator, qualifiers, candidates };
}

async function setup(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allostasis-allocator-'));
  const filename = path.join(directory, 'allocator.db');
  const instanceValue = await instance(filename, options.allocator);
  const unit = options.unit || 'tokens';
  const poolQuery = { scope: native.SCOPE, missionId: 'mission-1', budgetId: 'budget-1', unit };
  await instanceValue.allocator.initializePool(poolQuery, options.pool || { capacity: 10, protectedReserve: 2, consumed: 0 });
  return { ...instanceValue, directory, filename, poolQuery, unit };
}

async function request(fixture, options = {}) {
  const client = options.client || 'client-a';
  const amount = options.amount ?? 8;
  const id = options.id || `${client}:${sequence + 1}`;
  const qualifier = fixture.qualifiers.get(client);
  const report = (await qualifier.capture({ reportId: `report:${id}`, level: 'agent' })).report;
  const forecast = (await qualifier.captureForecast({ forecastId: `forecast:${id}`, reportId: report.reportId,
    level: 'agent', unit: fixture.unit, amount, candidateId: fixture.candidates.get(client).candidateId,
    uncertainty: { kind: 'unknown' } })).forecast;
  const frame = { sender: native.actor(client), conversationId: `conversation:${client}` };
  const reported = message('REPORT_STATE', { report }, frame);
  await fixture.allocator.apply(reported);
  const predicted = message('FORECAST_NEED', { forecast }, { ...frame, causalRefs: [reported.messageId] });
  await fixture.allocator.apply(predicted);
  return message('REQUEST_BUDGET', { requestId: `request:${id}`, budgetId: fixture.poolQuery.budgetId,
    unit: fixture.unit, amount, forecastId: forecast.forecastId, forecastDigest: digest(forecast) },
  { ...frame, causalRefs: [predicted.messageId] });
}

function cleanup(fixture) {
  fixture.allocator.close();
  if (path.dirname(path.resolve(fixture.directory)) !== path.resolve(os.tmpdir())) throw new Error('Unsafe ALLOSTASIS test cleanup.');
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

module.exports = { ...native, message, instance, setup, request, cleanup };
