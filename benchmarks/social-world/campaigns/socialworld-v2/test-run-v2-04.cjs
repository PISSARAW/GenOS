'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v204-runner-test-only';
const assert = require('node:assert/strict');
const path = require('node:path');
const { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS } = require('./run-v2-04.cjs');
const { validateReport } = require('./validate-report.cjs');

async function run() {
  const manifest = require('./manifest.json');
  const expected = manifest.comparisonArms['V2-04'];
  assert.deepEqual(REGISTERED_ARMS, expected);
  assert.deepEqual(EXECUTABLE_ARMS, ['genos-full']);
  const outputDirectory = path.join(__dirname, 'reports');
  let comparison;
  for (const arm of expected) {
    const result = await runScenario({ seed: 'socialworld-v2-04-01', arm, attempt: 1,
      outputDirectory, sourceCommit: 'deterministic-test' });
    const reportPath = path.join(outputDirectory, `V2-04-${arm}-test-report.json`);
    assert.deepEqual(validateReport(result.report, reportPath, path.resolve(__dirname, '../../../..')), []);
    assert.deepEqual(Object.keys(result.report.inputs.comparison).sort(), ['budgetHash', 'eventsHash', 'permissionsHash']);
    for (const digest of Object.values(result.report.inputs.comparison)) assert.match(digest, /^[a-f0-9]{64}$/);
    if (comparison) assert.deepEqual(result.report.inputs.comparison, comparison);
    comparison = result.report.inputs.comparison;
    if (arm === 'genos-full') {
      assert.equal(result.report.status, 'pass');
      assert.equal(result.report.oracle.checks.duplicateRejected, true);
      assert.equal(result.report.oracle.checks.invalidRejected, true);
      assert.equal(result.report.oracle.checks.unauthorizedRejected, true);
      assert.equal(result.report.oracle.checks.onlyAcceptedPersisted, true);
      assert.equal(result.report.oracle.checks.subsequentDecisionChanged, true);
      assert.notEqual(result.report.observed.trustBefore, result.report.observed.trustAfter);
    } else {
      assert.equal(result.report.status, 'inconclusive');
      assert.match(result.report.oracle.reason, /no implemented runtime adapter/);
      assert.deepEqual(result.evidence, []);
    }
  }
}

run().then(() => process.stdout.write('SocialWorld V2-04 runner tests passed\n'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
