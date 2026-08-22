import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReport } from '../lib/report-policy.mjs';

function report(overrides = {}) {
  return {
    schema_version: 'genos-benchmark-report-v1',
    task_id: 'B02',
    benchmark_id: 'genos.isolation',
    evidence: { commands: [] },
    metrics: [],
    audit: { decision: 'approved' },
    ...overrides,
  };
}

test('accepts a minimal approved internal report', () => {
  assert.deepEqual(validateReport(report()), []);
});

test('rejects numeric values for unsupported metrics', () => {
  const errors = validateReport(report({ metrics: [{ name: 'network_policy', status: 'unsupported', value: 0 }] }));
  assert.ok(errors.some((error) => error.includes('value=null')));
});

test('requires blocked public reports to withhold scores', () => {
  const errors = validateReport(report({
    public_benchmark: true,
    claim_allowed: false,
    score: 0,
    sample_size: 0,
    execution_status: 'blocked_external_dependency',
  }));
  assert.ok(errors.some((error) => error.includes('score=null')));
});

test('prevents approval when an evidence command failed', () => {
  const errors = validateReport(report({ evidence: { commands: [{ passed: false }] } }));
  assert.ok(errors.some((error) => error.includes('failed commands')));
});
