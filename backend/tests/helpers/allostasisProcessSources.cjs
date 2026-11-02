'use strict';

const { withTransaction } = require('../../src/db');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createStateQualifier } = require('../../src/services/allostasisProtocol/qualification');
const nativeFixture = require('./allostasisQualificationFixture');
const fixture = require('./allostasisProcessFixtures.cjs');

function qualifiers(db) {
  return new Map(['client-a', 'client-b'].map(client => {
    const config = nativeFixture.configuration(db, { sourceAgentId: client, scope: fixture.SCOPE,
      missionId: fixture.MISSION, maxAgeMs: 600000, clock: () => Date.now(),
      subjectBindings: { agent: client, topology: 'demo-topology', mission: fixture.MISSION,
        organization: fixture.SCOPE.organizationId } });
    return [client, { config, qualifier: createStateQualifier({ ...config,
      loadCandidate: nativeFixture.candidateReader(db, config) }) }];
  }));
}

async function bootstrap(allocator, sources) {
  await allocator.ready; await allocator.observations.ready;
  await allocator.db.exec('CREATE TABLE IF NOT EXISTS allostasis_demo_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await withTransaction(allocator.db, async () => {
    if (await allocator.db.get('SELECT value FROM allostasis_demo_settings WHERE name = ?', 'installed')) return;
    const measuredAt = Date.now();
    for (const { config } of sources.values()) await nativeFixture.seedNative(allocator.db, config, { measuredAt });
    await allocator.db.run('INSERT INTO allostasis_demo_settings(name,value) VALUES (?,?)', 'installed', 'true');
  });
}

async function plan(sources, input) {
  const source = sources.get(input.client);
  if (!source) throw new Error('Unknown native allostatic source.');
  const captured = await source.qualifier.captureForecast({ forecastId: input.forecastId,
    reportId: input.reportId, level: 'agent', unit: fixture.UNIT, amount: input.amount,
    candidateId: 'native-forecast-1' });
  if (!captured.available || captured.allocationAuthorized !== false) throw new Error('Native forecast unavailable.');
  return { report: captured.report, forecast: captured.forecast };
}

function sourceGetter(sources, kind) {
  return request => {
    const source = sources.get(request.message.sender.agentId);
    if (!source) throw new Error('Unknown pinned allostatic source.');
    return kind === 'report' ? source.qualifier.qualifyReport(request.report)
      : source.qualifier.qualifyForecast(request.forecast);
  };
}

function budgetProof(request) {
  const forecast = request.forecast.forecast;
  if (request.message.payload.amount > forecast.amount || forecast.subject.subjectId !== request.message.sender.agentId) {
    throw new Error('Declared need or forecast subject does not authorize this request.');
  }
  return { status: 'validated', requestDigest: digest(request),
    receiptDigest: digest({ policy: 'bounded-local-runtime/v1', request }) };
}

function usageReader(readSource) {
  return {
    verifyUsage: async request => {
      const input = { query: request.query, operationId: request.report.operationId };
      if (request.report.evidenceRef !== fixture.providerKey(input)) throw new Error('Usage source reference is not bound to this operation.');
      const common = { requestDigest: digest(request), evidenceRef: request.report.evidenceRef, metricId: 'wallTimeMs' };
      let receipt;
      try { receipt = await readSource(input); }
      catch (error) {
        if (error.code !== 'SOURCE_UNAVAILABLE') throw error;
        return { ...common, status: 'unknown', cumulativeAmount: null, final: false,
          source: 'unavailable', receiptDigest: digest({ request, outcome: 'source_unavailable' }) };
      }
      if (!receipt) return { ...common, status: 'unknown', cumulativeAmount: null, final: false,
        source: 'unavailable', receiptDigest: digest({ request, outcome: 'no_terminal_receipt' }) };
      const { receiptDigest, ...body } = receipt;
      if (digest({ profile: 'allostasis-demo-provider/v1', ...body }) !== receiptDigest) throw new Error('Provider receipt integrity mismatch.');
      validateReceipt(receipt, request);
      return { ...common, status: 'known', cumulativeAmount: receipt.cumulativeAmount,
        final: receipt.final, source: receipt.source, receiptDigest };
    } };
}

function validateReceipt(receipt, request) {
  const binding = { scope: receipt.scope, missionId: receipt.missionId, conversationId: receipt.conversationId,
    allocationId: receipt.allocationId, allocationDigest: receipt.allocationDigest, operationId: receipt.operationId };
  if (digest(binding) !== digest({ ...request.query, operationId: request.report.operationId }) ||
      receipt.unit !== request.allocation.unit || receipt.evidenceRef !== request.report.evidenceRef) {
    throw new Error('Provider receipt allocation or operation mismatch.');
  }
  if (receipt.providerId !== 'local-wall-time' || receipt.status !== 'known' || receipt.final !== true || receipt.source !== 'exact') {
    throw new Error('Provider receipt source or finality mismatch.');
  }
  if (!Number.isSafeInteger(receipt.cumulativeAmount) || receipt.cumulativeAmount < 0) throw new Error('Provider measurement invalid.');
}

module.exports = { qualifiers, bootstrap, plan, sourceGetter, budgetProof, usageReader };
