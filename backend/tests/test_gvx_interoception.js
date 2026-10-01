'use strict';

const assert = require('assert');
const { buildInteroceptiveState, evaluateViability } = require('../src/services/gvxInteroception');

function scope() { return { organizationId: 'org-a', projectId: 'project-a' }; }

function profile() {
  return {
    id: 'conservative-v1', version: 1,
    rules: [
      { signal: 'evidenceIntegrity', operator: 'gte', threshold: 0.98 },
      { signal: 'securityAnomalies', operator: 'eq', threshold: 0 },
      { signal: 'budgetRatio', operator: 'lte', threshold: 1 }
    ]
  };
}

function measurements(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
    value, source: `fixture:${key}`, measuredAt: new Date().toISOString()
  }]));
}

function checksMeasuredState() {
  const state = buildInteroceptiveState({ scope: scope(), measurements: measurements({
    evidenceIntegrity: 1, securityAnomalies: 0, budgetRatio: 0.5
  }) });
  assert.strictEqual(state.schema, 'genos.gvx.interoception/v1');
  assert.strictEqual(state.dimensions.memoryPressure.status, 'unknown');
  assert.strictEqual(evaluateViability(state, profile()).status, 'viable');
}

function checksUnknownAndFailure() {
  const unknown = buildInteroceptiveState({ scope: scope(), measurements: measurements({ securityAnomalies: 0 }) });
  assert.strictEqual(evaluateViability(unknown, profile()).status, 'inconclusive');
  const failed = buildInteroceptiveState({ scope: scope(), measurements: measurements({
    evidenceIntegrity: 0.9, securityAnomalies: 0, budgetRatio: 0.5
  }) });
  assert.strictEqual(evaluateViability(failed, profile()).status, 'outside_envelope');
}

function checksInvalidInput() {
  assert.throws(() => buildInteroceptiveState({ scope: {}, measurements: {} }), { code: 'GVX_SCOPE_REQUIRED' });
  const state = buildInteroceptiveState({ scope: scope(), measurements: measurements({ budgetRatio: 1.2 }) });
  assert.strictEqual(state.dimensions.budgetRatio.status, 'invalid');
  assert.strictEqual(evaluateViability(state, {
    id: 'broken', version: 1, rules: [{ signal: 'missing', operator: 'lte', threshold: 0.5 }]
  }), undefined);
}

function checksStaleness() {
  const measuredAt = '2026-10-01T00:00:00.000Z';
  const stale = buildInteroceptiveState({ scope: scope(), now: '2026-10-01T00:00:02.000Z',
    freshnessPolicy: { maxAgeMs: 1000 }, measurements: { evidenceIntegrity: {
      value: 1, source: 'fixture:stale', measuredAt
    } } });
  assert.strictEqual(stale.dimensions.evidenceIntegrity.status, 'stale');
  assert.strictEqual(stale.dimensions.evidenceIntegrity.value, 1);
  assert.strictEqual(evaluateViability(stale, profile()).status, 'inconclusive');
  const future = buildInteroceptiveState({ scope: scope(), now: '2026-10-01T00:00:00.000Z',
    freshnessPolicy: { maxAgeMs: 1000 }, measurements: { evidenceIntegrity: {
      value: 1, source: 'fixture:future', measuredAt: '2026-10-01T00:00:01.000Z'
    } } });
  assert.strictEqual(future.dimensions.evidenceIntegrity.status, 'invalid');
  const untimestamped = buildInteroceptiveState({ scope: scope(), freshnessPolicy: {
    maxAgeMs: 1000, now: '2026-10-01T00:00:00.000Z'
  }, measurements: { evidenceIntegrity: { value: 1, source: 'fixture:no-time' } } });
  assert.strictEqual(untimestamped.dimensions.evidenceIntegrity.status, 'invalid');
}

checksMeasuredState();
checksUnknownAndFailure();
checksStaleness();
assert.throws(checksInvalidInput, { code: 'GVX_RULE_INVALID' });
console.log('GVX interoception checks passed.');
