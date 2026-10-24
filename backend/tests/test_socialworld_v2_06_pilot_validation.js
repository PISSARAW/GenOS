'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateSocialWorldReport } = require('../src/services/socialWorldReportValidator');
const { stableHash } = require('../src/services/socialWorldReportEvidence');

const root = path.resolve(__dirname, '../..');
const campaign = path.join(root, 'benchmarks/social-world/campaigns/socialworld-v2');
const armRoles = {
  'genos-full': 'baseline', 'static-social-graph': 'comparison:static-social-graph',
  'llm-with-memory': 'comparison:llm-with-memory',
  'genos-without-relational-physiology': 'comparison:genos-without-relational-physiology',
  'genos-social-memory-ablated': 'masked', 'genos-social-memory-counterfactual': 'counterfactual',
};

function emptyArm(role) {
  return { role, status: 'inconclusive', reasonCode: 'NOT_RUN', limitations: ['Not executed.'],
    model: null, modelState: null, decision: null, interventionReceipt: null, evidenceRefs: [] };
}
function baseReport(seed, pilot) {
  const caseBytes = fs.readFileSync(path.join(campaign, 'V2-06-case.json'));
  const config = { organizationId: 'test-org', projectId: 'test-project' };
  return { campaignId: 'socialworld-v2', scenario: 'V2-06', arm: 'genos-full', ...(pilot ? { pilot: true } : {}),
    seed, attempt: 1, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    runtimeVersion: 'test', model: null, config, configHash: stableHash(config), status: 'inconclusive',
    reasonCode: 'PREFLIGHT_INCOMPLETE', startedAt: '2026-10-24T00:00:00.000Z', durationMs: 0,
    inputs: {}, observed: {}, oracle: { status: 'inconclusive', caseId: 'v2-06-collaboration-after-disagreement-v1' },
    evidenceRefs: [], violations: [], limitations: ['Provider/model not executed.'],
    caseId: 'v2-06-collaboration-after-disagreement-v1', caseHash: crypto.createHash('sha256').update(caseBytes).digest('hex'),
    sharedFactors: { contextHash: 'a', budgetHash: 'b', permissionHash: 'c' },
    arms: Object.fromEntries(Object.entries(armRoles).map(([name, role]) => [name, emptyArm(role)])) };
}
function withReportPath(seed, callback) {
  const reportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'socialworld-reports-'));
  const directory = path.join(reportsRoot, seed, 'attempt-001'); fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, 'report.json');
  try { const report = baseReport(seed, false); fs.writeFileSync(filename, JSON.stringify(report)); callback(report, filename, reportsRoot); }
  finally { fs.rmSync(reportsRoot, { recursive: true, force: true }); }
}
function testRegisteredPreflight() {
  withReportPath('socialworld-v2-06', (report, filename, reportsRoot) => {
    assert.deepEqual(validateSocialWorldReport(report, { reportPath: filename, reportsRoot }), {
      valid: true, errors: [], status: 'inconclusive', comparisonObservations: [
        { arm: 'static-social-graph', status: 'inconclusive', action: null },
        { arm: 'llm-with-memory', status: 'inconclusive', action: null },
        { arm: 'genos-without-relational-physiology', status: 'inconclusive', action: null },
      ],
    });
  });
}
function testPilotIsolation() {
  const reportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'socialworld-pilot-reports-'));
  const seed = 'pilot-' + crypto.randomUUID(); const directory = path.join(reportsRoot, 'pilot', seed);
  fs.mkdirSync(directory, { recursive: true }); const filename = path.join(directory, 'report.json');
  try {
    const report = baseReport(seed, true); report.pilot = true; fs.writeFileSync(filename, JSON.stringify(report));
    const result = validateSocialWorldReport(report, { reportPath: filename, reportsRoot });
    assert.equal(result.valid, true, result.errors.join('; ')); assert.equal(result.status, 'inconclusive');
  } finally { fs.rmSync(reportsRoot, { recursive: true, force: true }); }
}
function testCallerSuppliedPassRejected() {
  const report = baseReport('socialworld-v2-06', false); report.status = 'pass'; report.reasonCode = null;
  report.oracle.status = 'pass';
  for (const arm of Object.values(report.arms)) { arm.status = 'pass'; arm.reasonCode = null; arm.limitations = []; }
  const result = validateSocialWorldReport(report);
  assert.equal(result.valid, false);
}

testRegisteredPreflight();
testPilotIsolation();
testCallerSuppliedPassRejected();
console.log('SocialWorld V2-06 registered preflight, isolated pilot and pass evidence gates passed.');
