'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateSocialWorldReport } = require('../src/services/socialWorldReportValidator');

function report(overrides = {}) {
  return {
    campaignId: 'socialworld-v2', scenario: 'V2-03', arm: 'genos-full', seed: 1, attempt: 1,
    sourceCommit: 'a'.repeat(40), runtimeVersion: 'test-runtime-1', model: null,
    configHash: 'b'.repeat(64), status: 'pass', startedAt: '2026-10-24T00:00:00.000Z',
    durationMs: 1, inputs: {}, observed: {}, oracle: {}, evidenceRefs: ['receipt:1'],
    violations: [], limitations: [],
    ...overrides,
  };
}

function main() {
  assert.deepEqual(validateSocialWorldReport(report()), { valid: true, errors: [] });
  assert.equal(validateSocialWorldReport(report({ evidenceRefs: [] })).valid, false);
  assert.equal(validateSocialWorldReport(report({ violations: ['permission-boundary'] })).valid, false);
  assert.equal(validateSocialWorldReport(report({ scenario: 'V2-06', caseId: 'case-1', arms: {} })).valid, false);
  assert.equal(validateSocialWorldReport(report({ chainOfThought: 'must not be persisted' })).valid, false);

  const manifestPath = path.resolve(__dirname, '../../benchmarks/social-world/campaigns/socialworld-v2/manifest.json');
  const schemaPath = path.resolve(__dirname, '../../spec/socialworld-campaign-report.schema.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.deepEqual(Object.keys(schema.properties).filter((key) => schema.required.includes(key)).sort(),
    [...manifest.reportSchemaRequired].sort());
  console.log('SocialWorld report contract: schema, proof references and passing-report gates passed.');
}

try { main(); }
catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
