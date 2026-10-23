'use strict';

const assert = require('node:assert/strict');
const adapter = require('../bin/field-campaign-genos-repository-adapter.cjs');

const summary = { orchestratorId: 'orchestrator-a', success: true,
  completionGate: { allowed: true }, token_usage: { totalTokens: 20 },
  measured_usage: { schema: 'genos.measured-model-usage/v1', complete: true,
    allRunsCompleted: true, totalTokens: 20, totalCostUsd: 0.0042 },
  telemetry: [] };
const metrics = adapter.computeMetrics({ exitCode: 0, durationMs: 125,
  stdout: JSON.stringify(summary) });
assert.equal(metrics.success, true);
assert.equal(metrics.tokens, 20);
assert.equal(metrics.costUsd, 0.0042);
assert.equal(metrics.painObserved, false);
assert.deepEqual(adapter.pressureValues('training', 'full_arc', metrics),
  { before: null, after: null });
assert.equal(adapter.progressVerdict({ phase: 'heldout', intervention: 'full_arc',
  metrics, pressure: { before: null, after: null } }), 'inconclusive');

assert.throws(() => adapter.computeMetrics({ exitCode: 0, durationMs: 125,
  stdout: JSON.stringify({ ...summary, measured_usage: { complete: false } }) }),
{ code: 'SHEV_FIELD_USAGE_UNVERIFIED' });
assert.throws(() => adapter.computeMetrics({ exitCode: 0, durationMs: 125,
  stdout: JSON.stringify({ ...summary, success: false }) }),
{ code: 'SHEV_FIELD_MISSION_UNVERIFIED' });
assert.throws(() => adapter.computeMetrics({ exitCode: 0, durationMs: 125,
  stdout: 'process finished without terminal JSON' }),
{ code: 'SHEV_FIELD_SUMMARY_UNVERIFIED' });

console.log('Field campaign rejects missing metrics and never invents cost, tokens, pain or pressure.');
