'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/allostasisProtocol/contract');
const { AllostasisAllocator } = require('../../src/services/allostasisProtocol/allocator');
const { AllostasisUsage } = require('../../src/services/allostasisProtocol/usage');
const contractFixture = require('./allostasisContractFixture');

const NOW = '2026-11-02T10:00:00.000Z';
const actor = agentId => ({ agentId, incarnationId: `${agentId}-1`, trustDomain: 'allostasis-test' });
const CLIENT = actor('client'); const REGULATOR = actor('regulator');
const SCOPE = { organizationId: 'usage-organization', projectId: 'usage-project' };
let sequence = 0;

function message(type, payload, overrides = {}) {
  sequence += 1;
  const preempt = type === 'PREEMPT' || payload.reason === 'preempt';
  return createMessage({ messageId: `usage-message:${sequence}`, idempotencyKey: `usage-key:${sequence}`,
    operationId: 'usage-operation', scope: SCOPE, missionId: 'usage-mission', conversationId: 'usage-conversation',
    sender: preempt ? REGULATOR : CLIENT, audience: preempt ? CLIENT : REGULATOR,
    authority: { authorityId: 'fixture-grant', generation: 1 },
    generations: { incarnation: 1, organization: 1, workspace: 1 },
    createdAt: NOW, expiresAt: '2026-11-03T10:00:00Z', causalRefs: [], type, payload, ...overrides }, { now: NOW });
}

function usageMessage(fixture, values = {}) {
  const defaults = { allocationId: fixture.query.allocationId, allocationDigest: fixture.query.allocationDigest,
    operationId: 'provider-operation', receiptId: `usage-receipt:${sequence + 1}`, cumulativeAmount: null,
    status: 'unknown', unit: fixture.unit, evidenceRef: 'source:unavailable' };
  return message('REPORT_USAGE', { ...defaults, ...values });
}

function releaseMessage(fixture, reason = 'cancel', overrides = {}) {
  return message('RELEASE', { allocationId: fixture.query.allocationId, allocationDigest: fixture.query.allocationDigest,
    releaseId: `release:${sequence + 1}`, reason, evidenceRef: 'operator:release-unused', ...overrides });
}

async function verifiedSource(allocator, request) {
  const row = await allocator.db.get('SELECT body_json FROM fixture_usage_sources WHERE evidence_ref = ?', request.report.evidenceRef);
  const stored = row ? JSON.parse(row.body_json) : null;
  if (stored && (digest(stored.query) !== digest(request.query) || stored.operationId !== request.report.operationId || stored.unit !== request.report.unit)) {
    throw new Error('Native fixture source belongs to another allocation, operation or unit.');
  }
  const observation = stored ? { status: 'known', cumulativeAmount: stored.amount, final: stored.final,
    source: 'exact', metricId: stored.metricId } : { status: 'unknown', cumulativeAmount: null,
    final: false, source: 'unavailable', metricId: 'wallTimeMs' };
  return { ...observation, evidenceRef: request.report.evidenceRef, requestDigest: digest(request),
    receiptDigest: digest({ stored, requestDigest: digest(request) }) };
}

function qualifiedForecast(unit, query) {
  const subject = { level: 'agent', subjectId: CLIENT.agentId };
  const report = contractFixture.report({ reportId: 'fixture-report', scope: query.scope,
    missionId: query.missionId, subject });
  const forecast = contractFixture.forecast({ forecastId: query.forecastId, reportId: report.reportId,
    reportDigest: digest(report), scope: query.scope, missionId: query.missionId, subject, unit, amount: 80 });
  const frame = message('FORECAST_NEED', { forecast }, { messageId: 'fixture-forecast', idempotencyKey: 'fixture-forecast',
    scope: query.scope, missionId: query.missionId, conversationId: query.conversationId, causalRefs: ['fixture-report'] });
  return { message: frame, report, forecast };
}

async function setup(options = {}) {
  const unit = options.unit || 'tokens';
  const allocator = new AllostasisAllocator({ dbPath: options.dbPath || ':memory:', actor: REGULATOR,
    authority: { authorityId: 'regulator-grant', generation: 1 }, incarnationGeneration: 1,
    authorize: async () => true, verifyRequest: async request => ({ status: 'validated',
      requestDigest: digest(request), receiptDigest: digest('fixture-only-qualified-demand') }),
    observations: db => ({ db, forecast: async query => qualifiedForecast(unit, query) }), clock: () => NOW });
  try {
  const poolQuery = { scope: SCOPE, missionId: 'usage-mission', budgetId: 'usage-budget', unit };
  await allocator.ready;
  if (!await allocator.pool(poolQuery)) await allocator.initializePool(poolQuery, { capacity: 100, protectedReserve: 10, consumed: 0 });
  const granted = await allocator.apply(message('REQUEST_BUDGET', { requestId: options.requestId || 'fixture-request',
    budgetId: poolQuery.budgetId, unit, amount: 80, forecastId: 'fixture-forecast', forecastDigest: digest('fixture-forecast') },
  { causalRefs: ['fixture-forecast'] }));
  const query = granted.query;
  await allocator.db.exec(`CREATE TABLE IF NOT EXISTS fixture_usage_sources (
    evidence_ref TEXT PRIMARY KEY, body_json TEXT NOT NULL
  ); CREATE TRIGGER IF NOT EXISTS fixture_usage_sources_immutable BEFORE UPDATE ON fixture_usage_sources
    BEGIN SELECT RAISE(ABORT,'fixture usage source immutable'); END;`);
  const usage = new AllostasisUsage({ allocator, authorize: async () => true, verifyUsage: request => verifiedSource(allocator, request),
    clock: () => NOW, ...options.usage });
  await usage.ready;
  return { allocator, usage, query, poolQuery, unit };
  } catch (error) { allocator.close(); throw error; }
}

async function source(fixture, amount, options = {}) {
  const evidenceRef = options.evidenceRef || `source:${amount}:${options.final !== false}`;
  await fixture.allocator.db.run('INSERT INTO fixture_usage_sources VALUES (?,?)', evidenceRef,
    JSON.stringify({ query: fixture.query, unit: fixture.unit, operationId: options.operationId || 'provider-operation',
      amount, final: options.final !== false, metricId: options.metricId || 'wallTimeMs' }));
  return evidenceRef;
}

module.exports = { NOW, CLIENT, REGULATOR, SCOPE, message, usageMessage, releaseMessage, setup, source };
