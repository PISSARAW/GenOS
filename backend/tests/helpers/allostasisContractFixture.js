'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/allostasisProtocol/contract');

const NOW = '2026-11-02T10:00:00.000Z';
const SCOPE = { organizationId: 'organization-1', projectId: 'project-1' };
const actor = agentId => ({ agentId, incarnationId: `${agentId}-1`, trustDomain: 'local' });

function report(overrides = {}) {
  const sampledAt = Date.parse(NOW);
  const rawState = { variables: { energy: 0.75 }, measuredAt: sampledAt, evidenceRefs: ['persisted-state-reading-1'] };
  const snapshot = { service: 'agow.allostaticScopeService/v1', sourceAgentId: 'client-a',
    storageScope: 'agow_attention_policy', level: 'agent', rawState,
    scopeState: { status: 'measured', variables: rawState.variables, sampledAt, evidenceRefs: rawState.evidenceRefs } };
  return { reportId: 'report-1', status: 'available', scope: SCOPE, missionId: 'mission-1',
    subject: { level: 'agent', subjectId: 'client-a' }, observedAt: NOW, validUntil: '2026-11-02T10:01:00.000Z',
    measurements: [{ metricId: 'energy', unit: 'ratio_ppm', value: 750000, uncertainty: { kind: 'unknown' },
      quantization: { method: 'floor/ceil', scale: 1000000, rawValue: 0.75, lower: 750000, upper: 750000 },
      provenance: { sourceId: 'native-agow:client-a:agent:energy', sourceDigest: digest(snapshot),
        evidenceRefs: rawState.evidenceRefs, method: 'native_ratio_floor_ceil_ppm' } }], nativeSnapshot: snapshot, reasons: [], ...overrides };
}

function forecast(overrides = {}) {
  return { forecastId: 'forecast-1', reportId: 'report-1', reportDigest: digest(report()), scope: SCOPE,
    missionId: 'mission-1', subject: { level: 'agent', subjectId: 'client-a' }, unit: 'tokens', amount: 6,
    horizon: { unit: 'cycles', amount: 3 }, producedAt: NOW, validUntil: '2026-11-02T10:01:00.000Z',
    uncertainty: { kind: 'unknown' }, demandSource: 'declared',
    provenance: { sourceId: 'agow:candidate:forecast-candidate-1', sourceDigest: digest('candidate'),
      evidenceRefs: ['prediction-source-1'], method: 'native_viability_assessment_with_declared_resource_need' },
    nativeCandidate: { candidateId: 'forecast-candidate-1', agentId: 'client-a' },
    nativeAssessment: { available: true, horizonCycles: 3 }, ...overrides };
}

function allocation(overrides = {}) {
  return { allocationId: 'allocation-1', requestId: 'request-1', requestDigest: digest('request'), budgetId: 'budget-1',
    unit: 'tokens', amount: 6, client: actor('client-a'), regulator: actor('regulator'),
    forecastId: 'forecast-1', forecastDigest: digest(forecast()), expiresAt: '2026-11-02T10:01:00.000Z', ...overrides };
}

function payload(type) {
  if (type === 'REPORT_STATE') return { report: report() };
  if (type === 'FORECAST_NEED') return { forecast: forecast() };
  if (type === 'REQUEST_BUDGET') return { requestId: 'request-1', budgetId: 'budget-1', unit: 'tokens', amount: 6,
    forecastId: 'forecast-1', forecastDigest: digest(forecast()) };
  if (type === 'GRANT') return { allocation: allocation(), allocationDigest: digest(allocation()) };
  const query = { allocationId: 'allocation-1', allocationDigest: digest(allocation()) };
  if (type === 'REPORT_USAGE') return { ...query, operationId: 'operation-1', receiptId: 'receipt-1',
    cumulativeAmount: 2, status: 'known', unit: 'tokens', evidenceRef: 'provider-receipt-1' };
  if (type === 'RELEASE') return { ...query, releaseId: 'release-1', reason: 'complete', evidenceRef: 'provider-final-receipt' };
  if (type === 'PREEMPT') return { ...query, reason: 'Protected reserve pressure' };
  if (type === 'PRESSURE') return { budgetId: 'budget-1', unit: 'tokens', reason: 'Recovery reserve must remain protected' };
  return { requestId: 'request-1', requestDigest: digest('request'), budgetId: 'budget-1', unit: 'tokens', reason: 'Insufficient unreserved budget' };
}

function message(type = 'REPORT_STATE', overrides = {}) {
  const response = ['GRANT', 'PREEMPT', 'REJECT'].includes(type);
  return createMessage({ messageId: `message-${type.toLowerCase()}`, operationId: 'operation-1', missionId: 'mission-1',
    conversationId: 'conversation-1', type, sender: actor(response ? 'regulator' : 'client-a'), audience: actor(response ? 'client-a' : 'regulator'),
    scope: SCOPE, causalRefs: [], generations: { incarnation: 1, organization: 1, workspace: 1 },
    authority: { authorityId: 'authority-1', generation: 1 }, idempotencyKey: `key-${type.toLowerCase()}`,
    createdAt: NOW, expiresAt: '2026-11-02T10:02:00.000Z', payload: payload(type), ...overrides }, { now: NOW });
}

module.exports = { NOW, SCOPE, actor, report, forecast, allocation, payload, message };
